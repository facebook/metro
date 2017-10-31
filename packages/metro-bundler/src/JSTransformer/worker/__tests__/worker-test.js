/**
 * Copyright (c) 2015-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 *
 * @emails oncall+javascript_foundation
 * @format
 */
'use strict';

jest
  .mock('../constant-folding')
  .mock('../extract-dependencies')
  .mock('../inline')
  .mock('../minify');

const {objectContaining} = jasmine;

describe('code transformation worker:', () => {
  let transformCode;

  let extractDependencies, transformer;
  beforeEach(() => {
    jest.resetModules();
    ({transformCode} = require('..'));
    extractDependencies = require('../extract-dependencies').mockReturnValue(
      {},
    );
    transformer = {
      transform: jest.fn(({filename, options, src}) => ({
        code: src,
        map: [],
      })),
    };
  });

  it('calls the transform with file name, source code, and transform options', function() {
    const filename = 'arbitrary/file.js';
    const localPath = `local/${filename}`;
    const sourceCode = 'arbitrary(code)';
    const transformOptions = {arbitrary: 'options'};
    transformCode(
      transformer,
      filename,
      localPath,
      sourceCode,
      {dev: true, transform: transformOptions},
      () => {},
    );
    expect(transformer.transform).toBeCalledWith({
      filename,
      localPath,
      options: transformOptions,
      plugins: [],
      src: sourceCode,
    });
  });

  it('calls the transform with two plugins when not in dev mode', () => {
    const filename = 'arbitrary/file.js';
    const localPath = `local/${filename}`;
    const sourceCode = 'arbitrary(code)';
    const options = {dev: false, transform: {arbitrary: 'options'}};

    transformCode(
      transformer,
      filename,
      localPath,
      sourceCode,
      options,
      () => {},
    );

    const plugins = transformer.transform.mock.calls[0][0].plugins;

    expect(plugins[0]).toEqual([expect.any(Object), options]);
    expect(plugins[1]).toEqual([expect.any(Object), options]);
  });

  it('prefixes JSON files with an assignment to module.exports to make the code valid', function() {
    const filename = 'arbitrary/file.json';
    const localPath = `local/${filename}`;
    const sourceCode = '{"arbitrary":"property"}';
    transformCode(
      transformer,
      filename,
      localPath,
      sourceCode,
      {dev: true},
      () => {},
    );
    expect(transformer.transform).toBeCalledWith({
      filename,
      localPath,
      options: undefined,
      plugins: [],
      src: `module.exports=${sourceCode}`,
    });
  });

  it('calls back with the result of the transform in the cache', done => {
    const result = {
      code: 'some.other(code)',
      map: [],
    };

    transformCode(
      transformer,
      'filename',
      'local/filename',
      result.code,
      {},
      (error, data) => {
        expect(error).toBeNull();
        expect(data.result).toEqual(objectContaining(result));
        done();
      },
    );
  });

  it(
    'removes the leading assignment to `module.exports` before passing ' +
      'on the result if the file is a JSON file, even if minified',
    done => {
      const code = '{a:1,b:2}';
      const filePath = 'arbitrary/file.json';
      transformCode(
        transformer,
        filePath,
        filePath,
        code,
        {},
        (error, data) => {
          expect(error).toBeNull();
          expect(data.result.code).toEqual(code);
          done();
        },
      );
    },
  );

  it('removes shebang when present', done => {
    const shebang = '#!/usr/bin/env node';
    const result = {
      code: `${shebang} \n arbitrary(code)`,
    };
    const filePath = 'arbitrary/file.js';
    transformCode(
      transformer,
      filePath,
      filePath,
      result.code,
      {},
      (error, data) => {
        expect(error).toBeNull();
        const {code} = data.result;
        expect(code).not.toContain(shebang);
        expect(code.split('\n').length).toEqual(result.code.split('\n').length);
        done();
      },
    );
  });

  it('calls back with any error yielded by the transform', done => {
    const message = 'SyntaxError: this code is broken.';
    transformer.transform.mockImplementation(() => {
      throw new Error(message);
    });

    transformCode(
      transformer,
      'filename',
      'local/filename',
      'code',
      {},
      error => {
        expect(error.message).toBe(message);
        done();
      },
    );
  });

  describe('dependency extraction', () => {
    it('passes the transformed code the `extractDependencies`', done => {
      const code = 'arbitrary(code)';

      transformCode(
        transformer,
        'filename',
        'local/filename',
        code,
        {},
        error => {
          expect(error).toBeNull();
          expect(extractDependencies).toBeCalledWith(code, 'filename');
          done();
        },
      );
    });

    it(
      'uses `dependencies` and `dependencyOffsets` ' +
        'provided by `extractDependencies` for the result',
      done => {
        const dependencyData = {
          dependencies: ['arbitrary', 'list', 'of', 'dependencies'],
          dependencyOffsets: [12, 119, 185, 328, 471],
        };
        extractDependencies.mockReturnValue(dependencyData);

        transformCode(
          transformer,
          'filename',
          'local/filename',
          'code',
          {},
          (error, data) => {
            expect(error).toBeNull();
            expect(data.result).toEqual(objectContaining(dependencyData));
            done();
          },
        );
      },
    );

    it('does not extract requires of JSON files', done => {
      const jsonStr = '{"arbitrary":"json"}';
      transformCode(
        transformer,
        'arbitrary.json',
        'local/arbitrary.json',
        jsonStr,
        {},
        (error, data) => {
          expect(error).toBeNull();
          const {dependencies, dependencyOffsets} = data.result;
          expect(extractDependencies).not.toBeCalled();
          expect(dependencies).toEqual([]);
          expect(dependencyOffsets).toEqual([]);
          done();
        },
      );
    });

    it('calls back with every error thrown by `extractDependencies`', done => {
      const error = new Error('arbitrary');
      extractDependencies.mockImplementation(() => {
        throw error;
      });
      transformCode(
        transformer,
        'arbitrary.js',
        'local/arbitrary.js',
        'code',
        {},
        (e, data) => {
          expect(e).toBe(error);
          done();
        },
      );
    });
  });
});
