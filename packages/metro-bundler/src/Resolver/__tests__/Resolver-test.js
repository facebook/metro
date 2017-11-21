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

jest.useRealTimers();

jest.mock('path');

const DependencyGraph = jest.fn();
jest.setMock('../../node-haste/DependencyGraph', DependencyGraph);
let Module;
let Polyfill;

describe('Resolver', function() {
  let Resolver, path;

  beforeEach(function() {
    Resolver = require('../');
    path = require('path');
    DependencyGraph.mockClear();
    Module = jest.fn(function() {
      this.getName = jest.fn();
      this.getDependencies = jest.fn();
      this.isPolyfill = jest.fn().mockReturnValue(false);
      this.isJSON = jest.fn().mockReturnValue(false);
    });
    Polyfill = jest.fn(function() {
      var polyfill = new Module();
      polyfill.isPolyfill.mockReturnValue(true);
      return polyfill;
    });

    DependencyGraph.load = jest
      .fn()
      .mockImplementation(opts => Promise.resolve(new DependencyGraph(opts)));
    DependencyGraph.prototype.createPolyfill = jest.fn();
    DependencyGraph.prototype.getDependencies = jest.fn();

    // For the polyfillDeps
    path.join = jest.fn((a, b) => b);

    DependencyGraph.prototype.load = jest.fn(() => Promise.resolve());
  });

  class ResolutionResponseMock {
    constructor({dependencies, mainModuleId}) {
      this.dependencies = dependencies;
      this.mainModuleId = mainModuleId;
      this.getModuleId = createGetModuleId();
    }

    prependDependency(dependency) {
      this.dependencies.unshift(dependency);
    }

    finalize() {
      return Promise.resolve(this);
    }

    getResolvedDependencyPairs() {
      return [];
    }
  }

  function createModule(id, dependencies) {
    var module = new Module({});
    module.path = id;
    module.getName.mockImplementation(() => Promise.resolve(id));
    module.getDependencies.mockImplementation(() =>
      Promise.resolve(dependencies),
    );
    return module;
  }

  function createJsonModule(id) {
    const module = createModule(id, []);
    module.isJSON.mockReturnValue(true);
    return module;
  }

  function createPolyfill(id, dependencies) {
    var polyfill = new Polyfill({});
    polyfill.getName = jest.fn(() => Promise.resolve(id));
    polyfill.getDependencies = jest.fn(() => Promise.resolve(dependencies));
    return polyfill;
  }

  describe('wrapModule', function() {
    let depResolver;
    beforeEach(() => {
      return Resolver.load({
        projectRoot: '/root',
      }).then(r => {
        depResolver = r;
      });
    });

    it('should resolve modules', function() {
      expect.assertions(1);

      var code = [
        // require
        'require("x")',
        'require("y");require(\'abc\');',
        "require( 'z' )",
        'require( "a")',
        'require("b" )',
      ].join('\n');
      /*eslint-disable */

      function* findDependencyOffsets() {
        const re = /(['"']).*?\1/g;
        let match;
        while ((match = re.exec(code))) {
          yield match.index;
        }
      }

      const dependencyOffsets = Array.from(findDependencyOffsets());
      const module = createModule('test module', ['x', 'y']);
      const resolutionResponse = new ResolutionResponseMock({
        dependencies: [module],
        mainModuleId: 'test module',
      });

      resolutionResponse.getResolvedDependencyPairs = module => {
        return [
          ['x', createModule('changed')],
          ['y', createModule('Y')],
          ['abc', createModule('abc')],
        ];
      };

      const moduleIds = new Map(
        resolutionResponse
          .getResolvedDependencyPairs()
          .map(([importId, module]) => [
            importId,
            padRight(
              resolutionResponse.getModuleId(module.path),
              importId.length + 2,
            ),
          ]),
      );

      const dependencyPairs = new Map();
      for (const [
        relativePath,
        dependencyModule,
      ] of resolutionResponse.getResolvedDependencyPairs(module)) {
        dependencyPairs.set(relativePath, dependencyModule.path);
      }

      const {code: processedCode} = depResolver.wrapModule({
        module: module,
        getModuleId: resolutionResponse.getModuleId,
        dependencyPairs,
        name: 'test module',
        code,
        dependencyOffsets,
        dev: false,
      });

      expect(processedCode).toEqual(
        [
          '__d(/* test module */function(global, require, module, exports) {' +
            // require
            `require(${moduleIds.get('x')}) // ${moduleIds
              .get('x')
              .trim()} = x`,
          `require(${moduleIds.get('y')});require(${moduleIds.get(
            'abc',
          )}); // ${moduleIds.get('abc').trim()} = abc // ${moduleIds
            .get('y')
            .trim()} = y`,
          "require( 'z' )",
          'require( "a")',
          'require("b" )',
          `}, ${resolutionResponse.getModuleId(module.path)});`,
        ].join('\n'),
      );
    });

    it('should add module transport names as fourth argument to `__d`', () => {
      expect.assertions(1);

      const module = createModule('test module');
      const code = 'arbitrary(code)';
      const resolutionResponse = new ResolutionResponseMock({
        dependencies: [module],
        mainModuleId: 'test module',
      });

      const {code: processedCode} = depResolver.wrapModule({
        getModuleId: resolutionResponse.getModuleId,
        dependencyPairs: resolutionResponse.getResolvedDependencyPairs(module),
        code,
        module,
        name: 'test module',
        dev: true,
      });
      expect(processedCode).toEqual(
        [
          '__d(/* test module */function(global, require, module, exports) {' +
            code,
          `}, ${resolutionResponse.getModuleId(
            module.path,
          )}, null, "test module");`,
        ].join('\n'),
      );
    });

    it('should pass through passed-in source maps', () => {
      expect.assertions(1);
      const module = createModule('test module');
      const resolutionResponse = new ResolutionResponseMock({
        dependencies: [module],
        mainModuleId: 'test module',
      });
      const inputMap = {version: 3, mappings: 'ARBITRARY'};

      const {map} = depResolver.wrapModule({
        getModuleId: resolutionResponse.getModuleId,
        dependencyPairs: resolutionResponse.getResolvedDependencyPairs(module),
        module,
        name: 'test module',
        code: 'arbitrary(code)',
        map: inputMap,
      });
      expect(map).toBe(inputMap);
    });

    it('should resolve polyfills', async function() {
      expect.assertions(1);
      return Resolver.load({
        projectRoot: '/root',
      }).then(depResolver => {
        const polyfill = createPolyfill('test polyfill', []);
        const code = ['global.fetch = () => 1;'].join('');

        const {code: processedCode} = depResolver.wrapModule({
          module: polyfill,
          code,
        });

        expect(processedCode).toEqual(
          [
            '(function(global) {',
            'global.fetch = () => 1;',
            '\n})' +
              "(typeof global !== 'undefined' ? global : typeof self !== 'undefined' ? self : this);",
          ].join(''),
        );
      });
    });

    describe('JSON files:', () => {
      const code = JSON.stringify({arbitrary: 'data'});
      const id = 'arbitrary.json';
      let depResolver, module, resolutionResponse;

      beforeEach(() => {
        return Resolver.load({projectRoot: '/root'}).then(r => {
          depResolver = r;
          module = createJsonModule(id);
          resolutionResponse = new ResolutionResponseMock({
            dependencies: [module],
            mainModuleId: id,
          });
        });
      });

      it('should prefix JSON files with `module.exports=`', () => {
        expect.assertions(1);
        const {code: processedCode} = depResolver.wrapModule({
          getModuleId: resolutionResponse.getModuleId,
          dependencyPairs: resolutionResponse.getResolvedDependencyPairs(
            module,
          ),
          module,
          name: id,
          code,
          dev: false,
        });

        expect(processedCode).toEqual(
          [
            `__d(/* ${id} */function(global, require, module, exports) {`,
            `module.exports = ${code}\n}, ${resolutionResponse.getModuleId(
              module.path,
            )});`,
          ].join(''),
        );
      });
    });

    describe('minification:', () => {
      const code = 'arbitrary(code)';
      const id = 'arbitrary.js';
      let depResolver, minifyCode, module, resolutionResponse, sourceMap;

      beforeEach(() => {
        minifyCode = jest.fn((filename, code, map) =>
          Promise.resolve({code, map}),
        );
        module = createModule(id);
        module.path = '/arbitrary/path.js';
        resolutionResponse = new ResolutionResponseMock({
          dependencies: [module],
          mainModuleId: id,
        });
        sourceMap = [];
        return Resolver.load({
          projectRoot: '/root',
          minifyCode,
          postMinifyProcess: e => e,
        }).then(r => {
          depResolver = r;
        });
      });

      it('should use minified code', () => {
        expect.assertions(2);
        const minifiedCode = 'minified(code)';
        const minifiedMap = {
          version: 3,
          file: ['minified'],
          sources: [],
          mappings: '',
        };
        minifyCode.mockReturnValue(
          Promise.resolve({code: minifiedCode, map: minifiedMap}),
        );
        return depResolver
          .minifyModule(module.path, code, sourceMap)
          .then(({code, map}) => {
            expect(code).toEqual(minifiedCode);
            expect(map).toEqual([]);
          });
      });
    });
  });

  function createGetModuleId() {
    let nextId = 1;
    const knownIds = new Map();
    function createId(path) {
      const id = nextId;
      nextId += 1;
      knownIds.set(path, id);
      return id;
    }

    return path => knownIds.get(path) || createId(path);
  }

  function padRight(value, width) {
    const s = String(value);
    const diff = width - s.length;
    return diff > 0 ? s + Array(diff + 1).join(' ') : s;
  }
});
