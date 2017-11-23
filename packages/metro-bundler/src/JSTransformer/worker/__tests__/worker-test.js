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
  .mock('../minify')
  .mock('babel-generator');

const {objectContaining} = jasmine;

describe('code transformation worker:', () => {
  let transformCode;
  let babelGenerator;

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

    babelGenerator = require('babel-generator');

    babelGenerator.default.mockReturnValue({
      code: '',
      map: [],
    });
  });

  it('calls the transform with file name, source code, and transform options', function() {
    const filename = 'arbitrary/file.js';
    const localPath = `local/${filename}`;
    const sourceCode = 'arbitrary(code)';
    const transformOptions = {arbitrary: 'options'};
    transformCode(transformer, filename, localPath, sourceCode, {
      dev: true,
      transform: transformOptions,
    });
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

    transformCode(transformer, filename, localPath, sourceCode, options);

    const plugins = transformer.transform.mock.calls[0][0].plugins;

    expect(plugins[0]).toEqual([expect.any(Object), options]);
    expect(plugins[1]).toEqual([expect.any(Object), options]);
  });

  it('prefixes JSON files with an assignment to module.exports to make the code valid', function() {
    const filename = 'arbitrary/file.json';
    const localPath = `local/${filename}`;
    const sourceCode = '{"arbitrary":"property"}';
    transformCode(transformer, filename, localPath, sourceCode, {dev: true});

    expect(transformer.transform).toBeCalledWith({
      filename,
      localPath,
      options: undefined,
      plugins: [],
      src: `module.exports=${sourceCode}`,
    });
  });

  it('calls back with the result of the transform in the cache', async () => {
    const result = {
      code: 'some.other(code)',
      map: [],
    };

    babelGenerator.default.mockReturnValue({
      code: 'some.other(code)',
      map: [],
    });

    const data = await transformCode(
      transformer,
      'filename',
      'local/filename',
      result.code,
      {},
    );

    expect(data.result).toEqual(objectContaining(result));
  });

  it('removes the leading `module.exports` before returning if the file is a JSON file, even if minified', async () => {
    const code = '{a:1,b:2}';
    const filePath = 'arbitrary/file.json';

    babelGenerator.default.mockReturnValue({
      code: '{a:1,b:2}',
      map: [],
    });

    const data = await transformCode(transformer, filePath, filePath, code, {});

    expect(data.result.code).toEqual(code);
  });

  it('removes shebang when present', async () => {
    const shebang = '#!/usr/bin/env node';
    const result = {
      code: `${shebang} \n arbitrary(code)`,
    };
    const filePath = 'arbitrary/file.js';

    babelGenerator.default.mockReturnValue({
      code: `${shebang} \n arbitrary(code)`,
      map: [],
    });

    const data = await transformCode(
      transformer,
      filePath,
      filePath,
      result.code,
      {},
    );

    const {code} = data.result;
    expect(code).not.toContain(shebang);
    expect(code.split('\n').length).toEqual(result.code.split('\n').length);
  });

  it('calls back with any error yielded by the transform', async () => {
    const message = 'SyntaxError: this code is broken.';

    transformer.transform.mockImplementation(() => {
      throw new Error(message);
    });

    expect.assertions(1);

    try {
      await transformCode(
        transformer,
        'filename',
        'local/filename',
        'code',
        {},
      );
    } catch (error) {
      expect(error.message).toBe(message);
    }
  });

  describe('dependency extraction', () => {
    it('passes the transformed code the `extractDependencies`', async () => {
      const code = 'arbitrary(code)';

      babelGenerator.default.mockReturnValue({
        code: 'arbitrary(code)',
        map: [],
      });

      await transformCode(transformer, 'filename', 'local/filename', code, {});

      expect(extractDependencies).toBeCalledWith(code, 'filename');
    });

    it('uses `dependencies` and `dependencyOffsets` provided by `extractDependencies` for the result', async () => {
      const dependencyData = {
        dependencies: ['arbitrary', 'list', 'of', 'dependencies'],
        dependencyOffsets: [12, 119, 185, 328, 471],
      };

      extractDependencies.mockReturnValue(dependencyData);

      const data = await transformCode(
        transformer,
        'filename',
        'local/filename',
        'code',
        {},
      );

      expect(data.result).toEqual(objectContaining(dependencyData));
    });

    it('does not extract requires of JSON files', async () => {
      const jsonStr = '{"arbitrary":"json"}';

      babelGenerator.default.mockReturnValue({
        code: '{"arbitrary":"json"}',
        map: [],
      });

      const data = await transformCode(
        transformer,
        'arbitrary.json',
        'local/arbitrary.json',
        jsonStr,
        {},
      );

      const {dependencies, dependencyOffsets} = data.result;

      expect(extractDependencies).not.toBeCalled();
      expect(dependencies).toEqual([]);
      expect(dependencyOffsets).toEqual([]);
    });

    it('calls back with every error thrown by `extractDependencies`', async () => {
      const error = new Error('arbitrary');

      extractDependencies.mockImplementation(() => {
        throw error;
      });

      try {
        await transformCode(
          transformer,
          'arbitrary.js',
          'local/arbitrary.js',
          'code',
          {},
        );
      } catch (err) {
        expect(err).toBe(error);
      }
    });
  });
});
