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

describe('Resolver', function() {
  let Resolver, path;

  beforeEach(function() {
    Resolver = require('../');
    path = require('path');
    DependencyGraph.mockClear();

    Module = jest.fn(function() {
      this.isPolyfill = jest.fn().mockReturnValue(false);
      this.isJSON = jest.fn().mockReturnValue(false);
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

  function createModule(id, dependencies) {
    var module = new Module({});
    module.path = id;

    return module;
  }

  describe('minification:', () => {
    const code = 'arbitrary(code)';
    const id = 'arbitrary.js';
    let depResolver, minifyCode, module, sourceMap;

    beforeEach(() => {
      minifyCode = jest.fn((filename, code, map) =>
        Promise.resolve({code, map}),
      );
      module = createModule(id);
      module.path = '/arbitrary/path.js';

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
