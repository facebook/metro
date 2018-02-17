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

const invariant = require('fbjs/lib/invariant');
const nullthrows = require('fbjs/lib/nullthrows');
const transformModule = require('../transform-module');

const {babylon: {parse}} = require('../../../babel-bridge');
const {babelTypes: types} = require('../../../babel-bridge');
const {babelGenerate: generate} = require('../../../babel-bridge');
const {babelTraverse: traverse} = require('../../../babel-bridge');
const {fn} = require('../../test-helpers');
const {SourceMapConsumer} = require('source-map');

import type {TransformVariants} from '../../types.flow';

const t = types;

jest.mock('image-size', () => buffer => {
  return JSON.parse(buffer.toString('utf8')).__size;
});

describe('transforming JS modules:', () => {
  const filename = 'arbitrary.js';
  const sourceExts = new Set(['js', 'json']);
  const asyncRequireModulePath = 'asyncRequire';

  let transformer;

  beforeEach(() => {
    transformer = {
      transform: fn(),
      getCacheKey: () => 'foo',
    };
    transformer.transform.stub.returns(transformResult());
  });

  const {bodyAst, sourceCode, transformedCode} = createTestData();

  const options = (variants?: TransformVariants) => ({
    asyncRequireModulePath,
    filename,
    sourceExts,
    transformer,
    variants,
  });

  const transformResult = (body = bodyAst) => ({
    ast: t.file(t.program(body)),
  });

  it('passes through file name', () => {
    const result = transformModule(sourceCode, options());
    invariant(result.type === 'code', 'result must be code');
    expect(result.details).toEqual(
      expect.objectContaining({
        file: filename,
      }),
    );
  });

  it('exposes a haste ID if present', () => {
    const hasteID = 'TheModule';
    const codeWithHasteID = toBuffer(`/** @providesModule ${hasteID} */`);
    const result = transformModule(codeWithHasteID, options());
    invariant(result.type === 'code', 'result must be code');
    expect(result.details).toEqual(expect.objectContaining({hasteID}));
  });

  it('sets `type` to `"module"` by default', () => {
    const result = transformModule(sourceCode, options());
    invariant(result.type === 'code', 'result must be code');
    expect(result.details).toEqual(expect.objectContaining({type: 'module'}));
  });

  it('sets `type` to `"script"` if the input is a polyfill', () => {
    const result = transformModule(sourceCode, {...options(), polyfill: true});
    invariant(result.type === 'code', 'result must be code');
    expect(result.details).toEqual(expect.objectContaining({type: 'script'}));
  });

  const defaults = {
    assetDataPlugins: [],
    dev: false,
    hot: false,
    inlineRequires: false,
    minify: false,
    platform: '',
    projectRoot: '',
  };

  it('calls the passed-in transform function with code, file name, and options for all passed in variants', () => {
    const variants = {dev: {dev: true}, prod: {dev: false}};

    transformModule(sourceCode, options(variants));
    expect(transformer.transform).toBeCalledWith({
      filename,
      localPath: filename,
      options: {...defaults, ...variants.dev},
      src: sourceCode.toString('utf8'),
    });
    expect(transformer.transform).toBeCalledWith({
      filename,
      localPath: filename,
      options: {...defaults, ...variants.prod},
      src: sourceCode.toString('utf8'),
    });
  });

  it('calls back with any error yielded by the transform function', () => {
    const error = new Error();
    transformer.transform.stub.throws(error);
    try {
      transformModule(sourceCode, options());
      throw new Error('should not be reached');
    } catch (e) {
      expect(e).toBe(error);
    }
  });

  it('wraps the code produced by the transform function into a module factory', () => {
    const result = transformModule(sourceCode, options());

    invariant(result.type === 'code', 'result must be code');
    const {code, dependencyMapName} = result.details.transformed.default;
    invariant(dependencyMapName != null, 'dependencyMapName cannot be null');
    expect(code.replace(/\s+/g, '')).toEqual(
      `__d(function(global,_require,module,exports,${dependencyMapName}){${transformedCode}});`,
    );
  });

  it('wraps the code produced by the transform function into an IIFE for polyfills', () => {
    const result = transformModule(sourceCode, {...options(), polyfill: true});
    invariant(result.type === 'code', 'result must be code');
    const {code} = result.details.transformed.default;
    expect(code.replace(/\s+/g, '')).toEqual(
      `(function(global){${transformedCode}})(this);`,
    );
  });

  it('creates source maps', () => {
    const result = transformModule(sourceCode, options());
    invariant(result.type === 'code', 'result must be code');
    const {code, map} = result.details.transformed.default;
    const position = findColumnAndLine(code, 'code');
    expect(position).not.toBeNull();

    const consumer = new SourceMapConsumer(map);
    expect(consumer.originalPositionFor(position)).toEqual(
      expect.objectContaining({line: 1, column: sourceCode.indexOf('code')}),
    );
  });

  it('extracts dependencies (require calls)', () => {
    const dep1 = 'foo';
    const dep2 = 'bar';
    const code = `require('${dep1}'),require('${dep2}')`;
    const {body} = parse(code).program;
    transformer.transform.stub.returns(transformResult(body));

    const result = transformModule(toBuffer(code), options());
    invariant(result.type === 'code', 'result must be code');
    expect(result.details.transformed.default).toEqual(
      expect.objectContaining({
        dependencies: [
          {name: dep1, isAsync: false},
          {name: dep2, isAsync: false},
        ],
      }),
    );
  });

  it('transforms for all variants', () => {
    const variants = {dev: {dev: true}, prod: {dev: false}};
    transformer.transform.stub
      .withArgs(filename, sourceCode, variants.dev)
      .returns(transformResult(bodyAst))
      .withArgs(filename, sourceCode, variants.prod)
      .returns(transformResult([]));

    const result = transformModule(sourceCode, options(variants));
    invariant(result.type === 'code', 'result must be code');
    const {dev, prod} = result.details.transformed;
    expect(dev.code.replace(/\s+/g, '')).toEqual(
      `__d(function(global,_require,module,exports,${nullthrows(
        dev.dependencyMapName,
      )}){arbitrary(code);});`,
    );
    expect(prod.code.replace(/\s+/g, '')).toEqual(
      `__d(function(global,_require,module,exports,${nullthrows(
        prod.dependencyMapName,
      )}){arbitrary(code);});`,
    );
  });

  it('prefixes JSON files with `module.exports = `', () => {
    const json = '{"foo":"bar"}';

    const result = transformModule(toBuffer(json), {
      ...options(),
      filename: 'some.json',
    });
    invariant(result.type === 'code', 'result must be code');
    const {code} = result.details.transformed.default;
    expect(code.replace(/\s+/g, '')).toEqual(
      '__d(function(global,require,module,exports){' +
        `module.exports=${json}});`,
    );
  });

  it('does not create source maps for JSON files', () => {
    const result = transformModule(toBuffer('{}'), {
      ...options(),
      filename: 'some.json',
    });
    invariant(result.type === 'code', 'result must be code');
    expect(result.details.transformed.default).toEqual(
      expect.objectContaining({map: null}),
    );
  });

  it('adds package data for `package.json` files', () => {
    const pkg = {
      name: 'package-name',
      main: 'package/main',
      browser: {browser: 'defs'},
      'react-native': {'react-native': 'defs'},
    };

    const result = transformModule(toBuffer(JSON.stringify(pkg)), {
      ...options(),
      filename: 'arbitrary/package.json',
    });
    invariant(result.type === 'code', 'result must be code');
    expect(result.details.package).toEqual(pkg);
  });

  it('does not process non-source files', () => {
    const result = transformModule(toBuffer('arbitrary'), {
      ...options(),
      filename: 'some.yy',
    });
    invariant(result.type === 'unknown', 'result must be code');
  });

  describe('assets', () => {
    it('extract image sizes, platform, scale', () => {
      const image = {__size: {width: 30, height: 20}};
      ['foo.png', 'foo@2x.ios.png'].forEach(filePath => {
        expect(
          transformModule(toBuffer(JSON.stringify(image)), {
            ...options(),
            filename: filePath,
          }),
        ).toMatchSnapshot();
      });
    });

    it('throws on empty images', () => {
      expect(() =>
        transformModule(new Buffer(0), {...options(), filename: 'foo.png'}),
      ).toThrowErrorMatchingSnapshot();
    });
  });
});

function createTestData() {
  // creates test data with an transformed AST, so that we can test source
  // map generation.
  const sourceCode = 'some(arbitrary(code));';
  const fileAst = parse(sourceCode);
  traverse(fileAst, {
    CallExpression(path) {
      if (path.node.callee.name === 'some') {
        path.replaceWith(path.node.arguments[0]);
      }
    },
  });
  return {
    bodyAst: fileAst.program.body,
    sourceCode: toBuffer(sourceCode),
    transformedCode: generate(fileAst).code,
  };
}

function findColumnAndLine(text, string) {
  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const column = lines[i].indexOf(string);
    if (column !== -1) {
      const line = i + 1;
      return {line, column};
    }
  }
  return null;
}

function toBuffer(str) {
  return new Buffer(str, 'utf8');
}
