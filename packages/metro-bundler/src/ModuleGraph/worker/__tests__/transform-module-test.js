/**
 * Copyright (c) 2016-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 *
 * @format
 * @emails oncall+javascript_foundation
 */

'use strict';

const transformModule = require('../transform-module');

const t = require('babel-types');
const {SourceMapConsumer} = require('source-map');
const {fn} = require('../../test-helpers');
const {parse} = require('babylon');
const generate = require('babel-generator').default;
const {traverse} = require('babel-core');

describe('transforming JS modules:', () => {
  const filename = 'arbitrary';

  let transformer;

  beforeEach(() => {
    transformer = {
      transform: fn(),
    };
    transformer.transform.stub.returns(transformResult());
  });

  const {bodyAst, sourceCode, transformedCode} = createTestData();

  const options = variants => ({
    filename,
    transformer,
    variants,
  });

  const transformResult = (body = bodyAst) => ({
    ast: t.file(t.program(body)),
  });

  it('passes through file name and code', () => {
    const result = transformModule(sourceCode, options());
    expect(result.type).toBe('code');
    expect(result.details).toEqual(
      expect.objectContaining({
        code: sourceCode,
        file: filename,
      }),
    );
  });

  it('exposes a haste ID if present', () => {
    const hasteID = 'TheModule';
    const codeWithHasteID = `/** @providesModule ${hasteID} */`;
    const result = transformModule(codeWithHasteID, options());
    expect(result.type).toBe('code');
    expect(result.details).toEqual(expect.objectContaining({hasteID}));
  });

  it('sets `type` to `"module"` by default', () => {
    const result = transformModule(sourceCode, options());
    expect(result.type).toBe('code');
    expect(result.details).toEqual(expect.objectContaining({type: 'module'}));
  });

  it('sets `type` to `"script"` if the input is a polyfill', () => {
    const result = transformModule(sourceCode, {...options(), polyfill: true});
    expect(result.type).toBe('code');
    expect(result.details).toEqual(expect.objectContaining({type: 'script'}));
  });

  const defaults = {
    dev: false,
    generateSourceMaps: true,
    hot: false,
    inlineRequires: false,
    platform: '',
    projectRoot: '',
  };

  it(
    'calls the passed-in transform function with code, file name, and options ' +
      'for all passed in variants',
    () => {
      const variants = {dev: {dev: true}, prod: {dev: false}};

      transformModule(sourceCode, options(variants));
      expect(transformer.transform).toBeCalledWith({
        filename,
        localPath: filename,
        options: {...defaults, ...variants.dev},
        src: sourceCode,
      });
      expect(transformer.transform).toBeCalledWith({
        filename,
        localPath: filename,
        options: {...defaults, ...variants.prod},
        src: sourceCode,
      });
    },
  );

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

    const {code, dependencyMapName} = result.details.transformed.default;
    expect(code.replace(/\s+/g, '')).toEqual(
      `__d(function(global,require,module,exports,${dependencyMapName}){${transformedCode}});`,
    );
  });

  it('wraps the code produced by the transform function into an IIFE for polyfills', () => {
    const result = transformModule(sourceCode, {...options(), polyfill: true});
    const {code} = result.details.transformed.default;
    expect(code.replace(/\s+/g, '')).toEqual(
      `(function(global){${transformedCode}})(this);`,
    );
  });

  it('creates source maps', () => {
    const result = transformModule(sourceCode, options());
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

    const result = transformModule(code, options());
    expect(result.details.transformed.default).toEqual(
      expect.objectContaining({dependencies: [dep1, dep2]}),
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
    const {dev, prod} = result.details.transformed;
    expect(dev.code.replace(/\s+/g, '')).toEqual(
      `__d(function(global,require,module,exports,${dev.dependencyMapName}){arbitrary(code);});`,
    );
    expect(prod.code.replace(/\s+/g, '')).toEqual(
      `__d(function(global,require,module,exports,${prod.dependencyMapName}){arbitrary(code);});`,
    );
  });

  it('prefixes JSON files with `module.exports = `', () => {
    const json = '{"foo":"bar"}';

    const result = transformModule(json, {...options(), filename: 'some.json'});
    const {code} = result.details.transformed.default;
    expect(code.replace(/\s+/g, '')).toEqual(
      '__d(function(global,require,module,exports){' +
        `module.exports=${json}});`,
    );
  });

  it('does not create source maps for JSON files', () => {
    const result = transformModule('{}', {...options(), filename: 'some.json'});
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

    const result = transformModule(JSON.stringify(pkg), {
      ...options(),
      filename: 'arbitrary/package.json',
    });
    expect(result.details.package).toEqual(pkg);
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
    sourceCode,
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
