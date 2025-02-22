/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @format
 * @oncall react_native
 */

import {worker} from '../worker';
import * as fs from 'fs';
import * as path from 'path';
import * as vm from 'vm';

jest.mock('fs', () => {
  const path = require('path');
  const mockFs = {
    [path.join('/project', 'fruits', 'Banana.js')]: `
        const Strawberry = require("Strawberry");
      `,
    [path.join('/project', 'fruits', 'Pear.js')]: `
        const Banana = require("Banana");
        const Strawberry = require('Strawberry');
        const Lime = loadModule('Lime');
      `,
    [path.join('/project', 'fruits', 'Strawberry.js')]: `
        // Strawberry!
      `,
    [path.join('/project', 'fruits', 'LinkToStrawberry.js')]: {
      link: path.join('.', 'Strawberry.js'),
    },
    [path.join('/project', 'fruits', 'apple.png')]: Buffer.from([
      137, 80, 78, 71, 13, 10, 26, 10,
    ]),
    [path.join('/project', 'package.json')]: `
        {
          "name": "haste-package",
          "main": "foo.js"
        }
      `,
  };

  return {
    ...jest.createMockFromModule('fs'),
    readFileSync: jest.fn((path, options) => {
      const entry = mockFs[path];
      if (entry) {
        if (typeof entry.link === 'string') {
          throw new Error('Tried to call readFile on a symlink');
        }
        return options === 'utf8' ? entry : Buffer.from(entry);
      }
      throw new Error(`Cannot read path '${path}'.`);
    }),
  };
});

describe('worker', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('parses JavaScript files and extracts module information', async () => {
    expect(
      await worker({
        computeDependencies: true,
        filePath: path.join('/project', 'fruits', 'Pear.js'),
      }),
    ).toEqual({
      dependencies: ['Banana', 'Strawberry'],
    });

    expect(
      await worker({
        computeDependencies: true,
        filePath: path.join('/project', 'fruits', 'Strawberry.js'),
      }),
    ).toEqual({
      dependencies: [],
    });
  });

  test('accepts a custom dependency extractor', async () => {
    expect(
      await worker({
        computeDependencies: true,
        dependencyExtractor: path.join(__dirname, 'dependencyExtractor.js'),
        filePath: path.join('/project', 'fruits', 'Pear.js'),
      }),
    ).toEqual({
      dependencies: ['Banana', 'Strawberry', 'Lime'],
    });
  });

  test('delegates to hasteImplModulePath for getting the id', async () => {
    expect(
      await worker({
        computeDependencies: true,
        filePath: path.join('/project', 'fruits', 'Pear.js'),
        hasteImplModulePath: require.resolve('./haste_impl.js'),
      }),
    ).toEqual({
      dependencies: ['Banana', 'Strawberry'],
      id: 'Pear',
    });

    expect(
      await worker({
        computeDependencies: true,
        filePath: path.join('/project', 'fruits', 'Strawberry.js'),
        hasteImplModulePath: require.resolve('./haste_impl.js'),
      }),
    ).toEqual({
      dependencies: [],
      id: 'Strawberry',
    });
  });

  test('parses package.json files as haste packages when enableHastePackages=true', async () => {
    expect(
      await worker({
        computeDependencies: true,
        enableHastePackages: true,
        filePath: path.join('/project', 'package.json'),
      }),
    ).toEqual({
      dependencies: undefined,
      id: 'haste-package',
    });
  });

  test('does not parse package.json files as haste packages when enableHastePackages=false', async () => {
    expect(
      await worker({
        computeDependencies: true,
        enableHastePackages: false,
        filePath: path.join('/project', 'package.json'),
      }),
    ).toEqual({
      dependencies: undefined,
      id: undefined,
    });
  });

  test('returns an error when a file cannot be accessed', async () => {
    let error = null;

    try {
      await worker({computeDependencies: true, filePath: '/kiwi.js'});
    } catch (err) {
      error = err;
    }

    expect(error.message).toEqual(`Cannot read path '/kiwi.js'.`);
  });

  test('simply computes SHA-1s when requested (works well with binary data)', async () => {
    expect(
      await worker({
        computeSha1: true,
        filePath: path.join('/project', 'fruits', 'apple.png'),
      }),
    ).toEqual({sha1: '4caece539b039b16e16206ea2478f8c5ffb2ca05'});

    expect(
      await worker({
        computeSha1: false,
        filePath: path.join('/project', 'fruits', 'Banana.js'),
      }),
    ).toEqual({sha1: undefined});

    expect(
      await worker({
        computeSha1: true,
        filePath: path.join('/project', 'fruits', 'Banana.js'),
      }),
    ).toEqual({sha1: '7772b628e422e8cf59c526be4bb9f44c0898e3d1'});

    expect(
      await worker({
        computeSha1: true,
        filePath: path.join('/project', 'fruits', 'Pear.js'),
      }),
    ).toEqual({sha1: 'c7a7a68a1c8aaf452669dd2ca52ac4a434d25552'});

    await expect(
      worker({computeSha1: true, filePath: '/i/dont/exist.js'}),
    ).rejects.toThrow();
  });

  test('avoids computing dependencies if not requested and Haste does not need it', async () => {
    expect(
      await worker({
        computeDependencies: false,
        filePath: path.join('/project', 'fruits', 'Pear.js'),
        hasteImplModulePath: path.resolve(__dirname, 'haste_impl.js'),
      }),
    ).toEqual({
      dependencies: undefined,
      id: 'Pear',
      sha1: undefined,
    });

    // Ensure not disk access happened.
    expect(fs.readFileSync).not.toHaveBeenCalled();
    expect(fs.readFile).not.toHaveBeenCalled();
  });

  test('returns content if requested and content is read', async () => {
    expect(
      await worker({
        computeSha1: true,
        filePath: path.join('/project', 'fruits', 'Pear.js'),
        maybeReturnContent: true,
      }),
    ).toEqual({
      content: expect.any(Buffer),
      sha1: 'c7a7a68a1c8aaf452669dd2ca52ac4a434d25552',
    });
  });

  test('does not return content if maybeReturnContent but content is not read', async () => {
    expect(
      await worker({
        computeSha1: false,
        filePath: path.join('/project', 'fruits', 'Pear.js'),
        hasteImplModulePath: path.resolve(__dirname, 'haste_impl.js'),
        maybeReturnContent: true,
      }),
    ).toEqual({
      content: undefined,
      dependencies: undefined,
      id: 'Pear',
      sha1: undefined,
    });
  });

  test('can be loaded directly without transpilation', async () => {
    const code = await jest
      .requireActual('fs')
      .promises.readFile(require.resolve('../worker.js'), 'utf8');
    expect(() => new vm.Script(code)).not.toThrow();
  });
});
