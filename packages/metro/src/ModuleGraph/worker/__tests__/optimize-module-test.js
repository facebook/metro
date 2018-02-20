/**
 * Copyright (c) 2016-present, Facebook, Inc.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @emails oncall+javascript_foundation
 * @flow
 * @format
 */

'use strict';

const defaults = require('../../../defaults');
const invariant = require('fbjs/lib/invariant');
const nullthrows = require('fbjs/lib/nullthrows');
const optimizeModule = require('../optimize-module');
const transformModule = require('../transform-module');
const transformer = require('../../../transformer.js');

const {fn} = require('../../test-helpers');
const {SourceMapConsumer} = require('source-map');

const {objectContaining} = jasmine;

describe('optimizing JS modules', () => {
  const filename = 'arbitrary/file.js';
  const sourceExts = new Set(['js', 'json']);
  const asyncRequireModulePath = 'asyncRequire';
  const optimizationOptions = {
    dev: false,
    minifierPath: defaults.DEFAULT_METRO_MINIFIER_PATH,
    platform: 'android',
    postMinifyProcess: x => x,
  };
  const originalCode = new Buffer(
    `if (Platform.OS !== 'android') {
      require('arbitrary-dev');
    } else {
      __DEV__ ? require('arbitrary-android-dev') : require('arbitrary-android-prod');
    }`,
    'utf8',
  );

  let transformResult;
  beforeAll(() => {
    const trOpts = {asyncRequireModulePath, filename, sourceExts, transformer};
    const result = transformModule(originalCode, trOpts);
    invariant(result.type === 'code', 'result must be code');
    transformResult = new Buffer(
      JSON.stringify({type: 'code', details: result.details}),
      'utf8',
    );
  });

  it('copies everything from the transformed file, except for transform results', () => {
    const result = optimizeModule(transformResult, optimizationOptions);
    const expected = JSON.parse(transformResult.toString('utf8')).details;
    delete expected.transformed;
    invariant(result.type === 'code', 'result must be code');
    expect(result.details).toEqual(objectContaining(expected));
  });

  describe('code optimization', () => {
    let dependencyMapName, injectedVars, optimized, requireName;
    beforeAll(() => {
      const result = optimizeModule(transformResult, optimizationOptions);
      invariant(result.type === 'code', 'result must be code');
      optimized = result.details.transformed.default;
      injectedVars = nullthrows(
        optimized.code.match(/function\(([^)]*)/),
      )[1].split(',');
      [, requireName, , , dependencyMapName] = injectedVars;
    });

    it('optimizes code', () => {
      expect(optimized.code).toEqual(
        `__d(function(${injectedVars.join(
          ',',
        )}){${requireName}(${dependencyMapName}[0])});`,
      );
    });

    it('extracts dependencies', () => {
      expect(optimized.dependencies).toEqual([
        {name: 'arbitrary-android-prod', isAsync: false},
      ]);
    });

    it('creates source maps', () => {
      const consumer = new SourceMapConsumer(optimized.map);
      const column = optimized.code.lastIndexOf(requireName + '(');
      const loc = nullthrows(
        findLast(originalCode.toString('utf8'), 'require'),
      );

      expect(consumer.originalPositionFor({line: 1, column})).toEqual(
        objectContaining(loc),
      );
    });

    it('does not extract dependencies for polyfills', () => {
      const result = optimizeModule(transformResult, {
        ...optimizationOptions,
        isPolyfill: true,
      });
      invariant(result.type === 'code', 'result must be code');
      expect(result.details.transformed.default.dependencies).toEqual([]);
    });
  });

  describe('post-processing', () => {
    let postMinifyProcess, optimize;
    beforeEach(() => {
      postMinifyProcess = fn();
      optimize = () =>
        optimizeModule(transformResult, {
          ...optimizationOptions,
          postMinifyProcess,
        });
    });

    it('passes the result to the provided postprocessing function', () => {
      postMinifyProcess.stub.callsFake(x => x);
      const result = optimize();
      invariant(result.type === 'code', 'result must be code');
      const {code, map} = result.details.transformed.default;
      expect(postMinifyProcess).toBeCalledWith({code, map});
    });

    it('uses the result of the provided postprocessing function for the result', () => {
      const code = 'var postprocessed = "code";';
      const map = {version: 3, mappings: 'postprocessed'};
      postMinifyProcess.stub.returns({code, map});
      const result = optimize();
      invariant(result.type === 'code', 'result must be code');
      expect(result.details.transformed.default).toEqual(
        objectContaining({code, map}),
      );
    });
  });

  it('passes through non-code data unmodified', () => {
    const data = {type: 'asset', details: {arbitrary: 'data'}};
    expect(
      optimizeModule(new Buffer(JSON.stringify(data), 'utf8'), {
        dev: true,
        platform: '',
        minifierPath: defaults.DEFAULT_METRO_MINIFIER_PATH,
        postMinifyProcess: ({code, map}) => ({code, map}),
      }),
    ).toEqual(data);
  });
});

function findLast(code, needle) {
  const lines = code.split(/(?:(?!.)\s)+/);
  let line = lines.length;
  while (line--) {
    const column = lines[line].lastIndexOf(needle);
    if (column !== -1) {
      return {line: line + 1, column};
    }
  }
  return null;
}
