/**
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @emails oncall+metro_bundler
 * @format
 */

'use strict';

const fs = require('fs');

const {transformSync} = require('@babel/core');

function createModule(
  moduleSystem,
  moduleId,
  verboseName,
  factory,
  dependencyMap = [],
) {
  moduleSystem.__d(factory, moduleId, dependencyMap, verboseName);
}

describe('require', () => {
  const moduleSystemCode = (() => {
    const rawCode = fs.readFileSync(require.resolve('../require'), 'utf8');
    return transformSync(rawCode, {
      ast: false,
      babelrc: false,
      presets: [require.resolve('metro-react-native-babel-preset')],
      retainLines: true,
      sourceMaps: 'inline',
      sourceType: 'module',
    }).code;
  })();

  // eslint-disable-next-line no-new-func
  const createModuleSystem = new Function(
    'global',
    '__DEV__',
    moduleSystemCode,
  );

  let moduleSystem;

  beforeEach(() => {
    moduleSystem = {};
  });

  it('does not need any babel helper logic', () => {
    // The react native preset uses @babel/transform-runtime so helpers will be
    // imported from @babel/runtime.
    expect(moduleSystemCode.includes('@babel/runtime')).toBe(false);
  });

  it('works with plain bundles', () => {
    createModuleSystem(moduleSystem, false);
    expect(moduleSystem.__r).not.toBeUndefined();
    expect(moduleSystem.__d).not.toBeUndefined();

    const mockExports = {foo: 'bar'};
    const mockFactory = jest
      .fn()
      .mockImplementation(
        (
          global,
          require,
          importDefault,
          importAll,
          moduleObject,
          exports,
          dependencyMap,
        ) => {
          moduleObject.exports = mockExports;
        },
      );

    moduleSystem.__d(mockFactory, 1, [2, 3]);
    expect(mockFactory).not.toBeCalled();

    const m = moduleSystem.__r(1);
    expect(mockFactory.mock.calls.length).toBe(1);
    expect(mockFactory.mock.calls[0][0]).toBe(moduleSystem);
    expect(m).toBe(mockExports);
    expect(mockFactory.mock.calls[0][6]).toEqual([2, 3]);
  });

  it('works with Random Access Modules (RAM) bundles', () => {
    const mockExports = {foo: 'bar'};
    const mockFactory = jest
      .fn()
      .mockImplementation(
        (
          global,
          require,
          importDefault,
          importAll,
          moduleObject,
          exports,
          dependencyMap,
        ) => {
          moduleObject.exports = mockExports;
        },
      );

    moduleSystem.nativeRequire = jest
      .fn()
      .mockImplementation((localId, bundleId) => {
        // eslint-disable-next-line no-bitwise
        moduleSystem.__d(mockFactory, (bundleId << 16) + localId, [2, 3]);
      });
    createModuleSystem(moduleSystem, false);
    expect(moduleSystem.__r).not.toBeUndefined();
    expect(moduleSystem.__d).not.toBeUndefined();

    expect(moduleSystem.nativeRequire).not.toBeCalled();
    expect(mockFactory).not.toBeCalled();

    const CASES = [[1, 1, 0], [42, 42, 0], [196650, 42, 3]];

    CASES.forEach(([moduleId, localId, bundleId]) => {
      moduleSystem.nativeRequire.mockClear();
      mockFactory.mockClear();

      const m = moduleSystem.__r(moduleId);

      expect(moduleSystem.nativeRequire.mock.calls.length).toBe(1);
      expect(moduleSystem.nativeRequire).toBeCalledWith(localId, bundleId);

      expect(mockFactory.mock.calls.length).toBe(1);
      expect(mockFactory.mock.calls[0][0]).toBe(moduleSystem);
      expect(m).toBe(mockExports);
      expect(mockFactory.mock.calls[0][6]).toEqual([2, 3]);
    });
  });

  describe('functionality tests', () => {
    it('module.exports === exports', done => {
      createModuleSystem(moduleSystem, false);

      createModule(
        moduleSystem,
        0,
        'index.js',
        (global, require, importDefault, importAll, module, exports) => {
          expect(module.exports).toBe(exports);
          done();
        },
      );

      moduleSystem.__r(0);
    });

    it('exports values correctly via the module.exports variable', () => {
      createModuleSystem(moduleSystem, false);

      createModule(
        moduleSystem,
        0,
        'index.js',
        (global, require, importDefault, importAll, module) => {
          module.exports = 'foo';
        },
      );

      expect(moduleSystem.__r(0)).toEqual('foo');
    });

    it('exports values correctly via the exports variable', () => {
      createModuleSystem(moduleSystem, false);

      createModule(
        moduleSystem,
        0,
        'index.js',
        (global, require, importDefault, importAll, module, exports) => {
          exports.foo = 'foo';
        },
      );

      expect(moduleSystem.__r(0)).toEqual({foo: 'foo'});
    });

    it('exports an empty object by default', () => {
      createModuleSystem(moduleSystem, false);

      createModule(
        moduleSystem,
        0,
        'index.js',
        (global, require, importDefault, importAll, module, exports) => {
          // do nothing
        },
      );

      expect(moduleSystem.__r(0)).toEqual({});
    });

    it('has the same reference to exports and module.exports', () => {
      createModuleSystem(moduleSystem, false);

      createModule(
        moduleSystem,
        0,
        'index.js',
        (global, require, importDefault, importAll, module, exports) => {
          module.exports.a = 'test';
          exports.b = 'test2';
        },
      );

      expect(moduleSystem.__r(0)).toEqual({a: 'test', b: 'test2'});
    });

    it('exposes the verboseName in dev mode', done => {
      createModuleSystem(moduleSystem, true);

      createModule(moduleSystem, 0, 'index.js', (global, require) => {
        expect(require.getModules()[0].verboseName).toEqual('index.js');
        done();
      });

      moduleSystem.__r(0);
    });

    it('exposes module.id as moduleId on the module in dev mode', () => {
      createModuleSystem(moduleSystem, true);

      createModule(
        moduleSystem,
        1254,
        'index.js',
        (global, require, importDefault, importAll, module) => {
          module.exports = module.id;
        },
      );

      expect(moduleSystem.__r(1254)).toEqual(1254);
    });

    it('exposes module.id as moduleId on the module in prod mode', () => {
      createModuleSystem(moduleSystem, false);

      createModule(
        moduleSystem,
        1337,
        'index.js',
        (global, require, importDefault, importAll, module) => {
          module.exports = module.id;
        },
      );

      expect(moduleSystem.__r(1337)).toEqual(1337);
    });

    it('handles requires/exports correctly', () => {
      createModuleSystem(moduleSystem, false);

      createModule(
        moduleSystem,
        0,
        'foo.js',
        (global, require, importDefault, importAll, module) => {
          module.exports = require(1).bar;
        },
      );

      createModule(
        moduleSystem,
        1,
        'bar.js',
        (global, require, importDefault, importAll, module) => {
          module.exports = {
            bar: 'barExported',
          };
        },
      );

      expect(moduleSystem.__r(0)).toEqual('barExported');
    });

    it('only evaluates a module once', () => {
      createModuleSystem(moduleSystem, false);

      const fn = jest.fn();

      createModule(
        moduleSystem,
        0,
        'foo.js',
        (global, require, importDefault, importAll, module) => {
          fn();

          module.exports = 'my value';
        },
      );

      expect(moduleSystem.__r(0)).toEqual('my value');
      expect(moduleSystem.__r(0)).toEqual('my value');

      expect(fn.mock.calls.length).toBe(1);
    });

    it('throws an error when trying to require an unknown module', () => {
      createModuleSystem(moduleSystem, false);

      createModule(
        moduleSystem,
        0,
        'foo.js',
        (global, require, importDefault, importAll, module) => {
          require(99);
        },
      );

      expect(() => moduleSystem.__r(0)).toThrow(
        'Requiring unknown module "99"',
      );
    });

    it('throws an error when a module throws an error', () => {
      createModuleSystem(moduleSystem, false);

      createModule(
        moduleSystem,
        0,
        'foo.js',
        (global, require, importDefault, importAll, module) => {
          throw new Error('foo!');
        },
      );

      // First time it throws the original error.
      expect(() => moduleSystem.__r(0)).toThrow('foo!');

      // Afterwards it throws a wrapped error (the module is not reevaluated).
      expect(() => moduleSystem.__r(0)).toThrow(
        'Requiring module "0", which threw an exception: Error: foo!',
      );
    });

    it('can make use of the dependencyMap correctly', () => {
      createModuleSystem(moduleSystem, false);

      createModule(
        moduleSystem,
        0,
        'foo.js',
        (
          global,
          require,
          importDefault,
          importAll,
          module,
          exports,
          dependencyMap,
        ) => {
          module.exports = require(dependencyMap[0]);
        },
        [33],
      );
      createModule(
        moduleSystem,
        33,
        'foo.js',
        (global, require, importDefault, importAll, module) => {
          module.exports = 'module 33';
        },
      );

      expect(moduleSystem.__r(0)).toEqual('module 33');
    });

    it('allows to require verboseNames in dev mode', () => {
      createModuleSystem(moduleSystem, true);

      createModule(
        moduleSystem,
        0,
        'foo.js',
        (global, require, importDefault, importAll, module) => {
          module.exports = 'Hi!';
        },
      );

      const warn = console.warn;
      console.warn = jest.fn();

      expect(moduleSystem.__r('foo.js')).toEqual('Hi!');
      expect(console.warn).toHaveBeenCalledWith(
        'Requiring module "foo.js" by name is only supported for debugging purposes and will BREAK IN PRODUCTION!',
      );

      console.warn = warn;
    });

    it('throws an error when requiring an incorrect verboseNames in dev mode', () => {
      createModuleSystem(moduleSystem, true);

      createModule(
        moduleSystem,
        0,
        'foo.js',
        (global, require, importDefault, importAll, module) => {
          module.exports = 'Hi!';
        },
      );

      expect(() => moduleSystem.__r('wrong.js')).toThrow(
        'Unknown named module: "wrong.js"',
      );
    });
  });

  describe('clearing require cache', () => {
    it('exposes a method', () => {
      let requireOld;
      let requireNew;

      const factory = jest.fn(
        (global, require, importDefault, importAll, module) => {
          module.exports.name = 'foo';
        },
      );

      function defineModule0() {
        createModule(moduleSystem, 0, 'foo.js', factory);
      }

      createModuleSystem(moduleSystem, false);

      // The clearing function exists.
      expect(moduleSystem.__c).toBeInstanceOf(Function);

      // Resetting the cache will make the module disappear.
      defineModule0();
      expect(() => moduleSystem.__r(0)).not.toThrow();
      moduleSystem.__c();
      expect(() => moduleSystem.__r(0)).toThrow();

      // Not resetting the cache, the same require twice returns the same instance.
      defineModule0();
      requireOld = moduleSystem.__r(0);
      requireNew = moduleSystem.__r(0);
      expect(requireOld).toBe(requireNew);

      // Resetting the cache, the same require twice will return a new instance.
      factory.mockClear();

      moduleSystem.__c();
      defineModule0();
      requireOld = moduleSystem.__r(0);

      moduleSystem.__c();
      defineModule0();
      requireNew = moduleSystem.__r(0);

      expect(requireOld).not.toBe(requireNew);
      expect(factory).toHaveBeenCalledTimes(2);

      // But they are equal in structure, because the same code was executed.
      expect(requireOld).toEqual(requireNew);
    });
  });

  describe('cyclic dependencies', () => {
    it('logs a warning when there is a cyclic dependency in dev mode', () => {
      createModuleSystem(moduleSystem, true);

      createModule(moduleSystem, 0, 'foo.js', (global, require) => {
        require(1);
      });

      createModule(moduleSystem, 1, 'bar.js', (global, require) => {
        require(2);
      });

      createModule(moduleSystem, 2, 'baz.js', (global, require) => {
        require(0);
      });

      const warn = console.warn;
      console.warn = jest.fn();

      moduleSystem.__r(0);
      expect(console.warn).toHaveBeenCalledWith(
        [
          'Require cycle: foo.js -> bar.js -> baz.js -> foo.js',
          '',
          'Require cycles are allowed, but can result in uninitialized values. Consider refactoring to remove the need for a cycle.',
        ].join('\n'),
      );

      console.warn = warn;
    });

    it('sets the exports value to their current value', () => {
      createModuleSystem(moduleSystem, false);

      createModule(
        moduleSystem,
        0,
        'foo.js',
        (global, require, importDefault, importAll, module) => {
          module.exports = require(1).bar();
        },
      );

      createModule(
        moduleSystem,
        1,
        'foo.js',
        (global, require, importDefault, importAll, module) => {
          module.exports.bar = function() {
            return require(0);
          };
        },
      );

      expect(moduleSystem.__r(0)).toEqual({});
    });

    it('handles well requires on previously defined exports', () => {
      createModuleSystem(moduleSystem, false);

      createModule(
        moduleSystem,
        0,
        'foo.js',
        (global, require, importDefault, importAll, module) => {
          module.exports.foo = 'foo';
          module.exports.bar = require(1).bar();
          module.exports.baz = 'baz';
        },
      );

      createModule(
        moduleSystem,
        1,
        'foo.js',
        (global, require, importDefault, importAll, module) => {
          module.exports.bar = function() {
            expect(require(0).baz).not.toBeDefined();
            return require(0).foo + '-cyclic';
          };
        },
      );

      expect(moduleSystem.__r(0)).toEqual({
        bar: 'foo-cyclic',
        baz: 'baz',
        foo: 'foo',
      });
    });

    it('handles well requires when redefining module.exports', () => {
      createModuleSystem(moduleSystem, false);

      createModule(
        moduleSystem,
        0,
        'foo.js',
        (global, require, importDefault, importAll, module) => {
          module.exports = {
            foo: 'foo',
          };
          module.exports.bar = require(1).bar();
        },
      );

      createModule(
        moduleSystem,
        1,
        'foo.js',
        (global, require, importDefault, importAll, module) => {
          module.exports.bar = function() {
            return require(0).foo + '-cyclic';
          };
        },
      );

      expect(moduleSystem.__r(0)).toEqual({foo: 'foo', bar: 'foo-cyclic'});
    });
  });

  describe('ES6 module support with Babel interoperability', () => {
    it('supports default imports from ES6 modules', () => {
      createModuleSystem(moduleSystem, false);

      createModule(
        moduleSystem,
        0,
        'foo.js',
        (global, require, importDefault, importAll, module, exports) => {
          expect(importDefault(1)).toEqual({bar: 'bar'});
        },
      );

      createModule(
        moduleSystem,
        1,
        'bar.js',
        (global, require, importDefault, importAll, module, exports) => {
          exports.__esModule = true;
          exports.default = {bar: 'bar'};
        },
      );

      expect.assertions(1);
      moduleSystem.__r(0);
    });

    it('supports default imports from non-ES6 modules', () => {
      createModuleSystem(moduleSystem, false);

      createModule(
        moduleSystem,
        0,
        'foo.js',
        (global, require, importDefault, importAll, module, exports) => {
          expect(importDefault(1)).toEqual({bar: 'bar'});
          expect(importDefault(2)).toBe(null);
        },
      );

      createModule(
        moduleSystem,
        1,
        'bar.js',
        (global, require, importDefault, importAll, module, exports) => {
          module.exports = {bar: 'bar'};
        },
      );

      createModule(
        moduleSystem,
        2,
        'bar.js',
        (global, require, importDefault, importAll, module, exports) => {
          module.exports = null;
        },
      );

      expect.assertions(2);
      moduleSystem.__r(0);
    });

    it('supports named imports', () => {
      createModuleSystem(moduleSystem, false);

      createModule(
        moduleSystem,
        0,
        'foo.js',
        (global, require, importDefault, importAll, module, exports) => {
          expect(require(1).bar).toBe('potato');
        },
      );

      createModule(
        moduleSystem,
        1,
        'bar.js',
        (global, require, importDefault, importAll, module, exports) => {
          module.exports.bar = 'potato';
        },
      );

      expect.assertions(1);
      moduleSystem.__r(0);
    });

    it('supports wildcard imports from ES6 modules', () => {
      createModuleSystem(moduleSystem, false);

      createModule(
        moduleSystem,
        0,
        'foo.js',
        (global, require, importDefault, importAll, module, exports) => {
          expect(importAll(1)).toMatchObject({default: 'bar', baz: 'baz'});
        },
      );

      createModule(
        moduleSystem,
        1,
        'bar.js',
        (global, require, importDefault, importAll, module, exports) => {
          exports.__esModule = true;
          exports.default = 'bar';
          exports.baz = 'baz';
        },
      );

      expect.assertions(1);
      moduleSystem.__r(0);
    });

    it('supports wildcard imports from non-ES6 modules', () => {
      createModuleSystem(moduleSystem, false);

      createModule(
        moduleSystem,
        0,
        'foo.js',
        (global, require, importDefault, importAll, module, exports) => {
          expect(importAll(1).default).toBeInstanceOf(Function);
          expect(importAll(1).default).toBe(importDefault(1));
          expect(importAll(1).bar).toBe('bar');
        },
      );

      createModule(
        moduleSystem,
        1,
        'bar.js',
        (global, require, importDefault, importAll, module, exports) => {
          module.exports = function bar() {};
          module.exports.bar = 'bar';
        },
      );

      expect.assertions(3);
      moduleSystem.__r(0);
    });
  });

  describe('packModuleId and unpackModuleId', () => {
    it('packModuleId and unpackModuleId are inverse operations', () => {
      createModuleSystem(moduleSystem, false);

      const resultSet = new Set();
      // eslint-disable-next-line no-bitwise
      for (const id of [0, 1, (1 << 16) - 1, 1 << 16, (1 << 16) + 1]) {
        const result = moduleSystem.__r.unpackModuleId(id);
        expect(resultSet.has(result)).not.toBe(true);
        resultSet.add(result);
        expect(moduleSystem.__r.packModuleId(result)).toBe(id);
      }
    });
  });

  describe('hot reloading', () => {
    it('is disabled in production', () => {
      createModuleSystem(moduleSystem, false);
      createModule(
        moduleSystem,
        0,
        'foo.js',
        (global, require, importDefault, importAll, module, exports) => {
          expect(module.hot).toBe(undefined);
        },
      );
      expect.assertions(1);
      moduleSystem.__r(0);
    });

    it('re-runs accepted modules', () => {
      let log = [];
      createModuleSystem(moduleSystem, true);
      createModule(
        moduleSystem,
        0,
        'foo.js',
        (global, require, importDefault, importAll, module, exports) => {
          log.push('init FooV1');
          require(1);
        },
      );
      createModule(
        moduleSystem,
        1,
        'bar.js',
        (global, require, importDefault, importAll, module, exports) => {
          log.push('init BarV1');
          // This module accepts itself:
          module.hot.accept();
        },
      );
      moduleSystem.__r(0);
      expect(log).toEqual(['init FooV1', 'init BarV1']);
      log = [];

      // We only edited Bar, and it accepted.
      // So we expect it to re-run alone.
      moduleSystem.__accept(
        1,
        (global, require, importDefault, importAll, module, exports) => {
          log.push('init BarV2');
          module.hot.accept();
        },
        [],
        {1: [0], 0: []},
        undefined,
      );
      expect(log).toEqual(['init BarV2']);
      log = [];

      // We only edited Bar, and it accepted.
      // So we expect it to re-run alone.
      moduleSystem.__accept(
        1,
        (global, require, importDefault, importAll, module, exports) => {
          log.push('init BarV3');
          module.hot.accept();
        },
        [],
        {1: [0], 0: []},
        undefined,
      );
      expect(log).toEqual(['init BarV3']);
      log = [];
    });

    it('propagates a hot update to closest accepted module', () => {
      let log = [];
      createModuleSystem(moduleSystem, true);
      createModule(
        moduleSystem,
        0,
        'foo.js',
        (global, require, importDefault, importAll, module, exports) => {
          log.push('init FooV1');
          require(1);
          // This module accepts itself:
          module.hot.accept();
        },
      );
      createModule(
        moduleSystem,
        1,
        'bar.js',
        (global, require, importDefault, importAll, module, exports) => {
          log.push('init BarV1');
        },
      );
      moduleSystem.__r(0);
      expect(log).toEqual(['init FooV1', 'init BarV1']);
      log = [];

      // We edited Bar, but it doesn't accept.
      // So we expect it to re-run together with Foo which does.
      moduleSystem.__accept(
        1,
        (global, require, importDefault, importAll, module, exports) => {
          log.push('init BarV2');
        },
        [],
        {1: [0], 0: []},
        undefined,
      );
      expect(log).toEqual(['init BarV2', 'init FooV1']);
      log = [];

      // We edited Bar, but it doesn't accept.
      // So we expect it to re-run together with Foo which does.
      moduleSystem.__accept(
        1,
        (global, require, importDefault, importAll, module, exports) => {
          log.push('init BarV3');
        },
        [],
        {1: [0], 0: []},
        undefined,
      );
      expect(log).toEqual(['init BarV3', 'init FooV1']);
      log = [];

      // We edited Bar so that it accepts itself.
      // Now there's no need to re-run Foo.
      moduleSystem.__accept(
        1,
        (global, require, importDefault, importAll, module, exports) => {
          log.push('init BarV3');
          // Now accepts:
          module.hot.accept();
        },
        [],
        {1: [0], 0: []},
        undefined,
      );
      expect(log).toEqual(['init BarV3']);
      log = [];
    });

    it('propagates hot update to all inverse dependencies', () => {
      let log = [];
      createModuleSystem(moduleSystem, true);

      // This is the module graph:
      //        MiddleA*
      //     /            \
      // Root* - MiddleB*  - Leaf
      //     \
      //        MiddleC
      //
      // * - accepts update
      //
      // We expect that editing Leaf will propagate to
      // MiddleA and MiddleB both of which can handle updates.

      createModule(
        moduleSystem,
        0,
        'root.js',
        (global, require, importDefault, importAll, module, exports) => {
          log.push('init RootV1');
          require(1);
          require(2);
          require(3);
          module.hot.accept();
        },
      );
      createModule(
        moduleSystem,
        1,
        'middleA.js',
        (global, require, importDefault, importAll, module, exports) => {
          log.push('init MiddleAV1');
          require(4); // Import leaf
          module.hot.accept();
        },
      );
      createModule(
        moduleSystem,
        2,
        'middleB.js',
        (global, require, importDefault, importAll, module, exports) => {
          log.push('init MiddleBV1');
          require(4); // Import leaf
          module.hot.accept();
        },
      );
      createModule(
        moduleSystem,
        3,
        'middleC.js',
        (global, require, importDefault, importAll, module, exports) => {
          log.push('init MiddleCV1');
          // This one doesn't import leaf and also
          // doesn't accept updates.
        },
      );
      createModule(
        moduleSystem,
        4,
        'leaf.js',
        (global, require, importDefault, importAll, module, exports) => {
          log.push('init LeafV1');
          // Doesn't accept its own updates; they will propagate.
        },
      );
      moduleSystem.__r(0);
      expect(log).toEqual([
        'init RootV1',
        'init MiddleAV1',
        'init LeafV1',
        'init MiddleBV1',
        'init MiddleCV1',
      ]);
      log = [];

      // We edited Leaf, but it doesn't accept.
      // So we expect it to re-run together with MiddleA and MiddleB which do.
      moduleSystem.__accept(
        4,
        (global, require, importDefault, importAll, module, exports) => {
          log.push('init LeafV2');
        },
        [],
        // Inverse dependency map.
        {
          4: [2, 1],
          3: [0],
          2: [0],
          1: [0],
          0: [],
        },
        undefined,
      );
      expect(log).toEqual(['init LeafV2', 'init MiddleBV1', 'init MiddleAV1']);
      log = [];

      // Let's try the same one more time.
      moduleSystem.__accept(
        4,
        (global, require, importDefault, importAll, module, exports) => {
          log.push('init LeafV2');
        },
        [],
        // Inverse dependency map.
        {
          4: [2, 1],
          3: [0],
          2: [0],
          1: [0],
          0: [],
        },
        undefined,
      );
      expect(log).toEqual(['init LeafV2', 'init MiddleBV1', 'init MiddleAV1']);
      log = [];

      // Now edit MiddleB. It should accept and re-run alone.
      moduleSystem.__accept(
        2,
        (global, require, importDefault, importAll, module, exports) => {
          log.push('init MiddleBV2');
          require(4);
          module.hot.accept();
        },
        [],
        // Inverse dependency map.
        {
          4: [2, 1],
          3: [0],
          2: [0],
          1: [0],
          0: [],
        },
        undefined,
      );
      expect(log).toEqual(['init MiddleBV2']);
      log = [];

      // Finally, edit MiddleC. It didn't accept so it should bubble to Root.
      moduleSystem.__accept(
        3,
        (global, require, importDefault, importAll, module, exports) => {
          log.push('init MiddleCV2');
        },
        [],
        // Inverse dependency map.
        {
          4: [2, 1],
          3: [0],
          2: [0],
          1: [0],
          0: [],
        },
        undefined,
      );
      expect(log).toEqual(['init MiddleCV2', 'init RootV1']);
      log = [];
    });

    it('provides fresh value for module.exports in parents', () => {
      let log = [];
      createModuleSystem(moduleSystem, true);
      createModule(
        moduleSystem,
        0,
        'foo.js',
        (global, require, importDefault, importAll, module, exports) => {
          const BarValue = require(1);
          log.push('init FooV1 with BarValue = ' + BarValue);
          // This module accepts itself:
          module.hot.accept();
        },
      );
      createModule(
        moduleSystem,
        1,
        'bar.js',
        (global, require, importDefault, importAll, module, exports) => {
          log.push('init BarV1');
          module.exports = 1;
          // This module will propagate to the parent.
        },
      );
      moduleSystem.__r(0);
      expect(log).toEqual(['init BarV1', 'init FooV1 with BarValue = 1']);
      log = [];

      // We edited Bar, but it doesn't accept.
      // So we expect it to re-run together with Foo which does.
      moduleSystem.__accept(
        1,
        (global, require, importDefault, importAll, module, exports) => {
          log.push('init BarV2');
          module.exports = 2;
        },
        [],
        {1: [0], 0: []},
        undefined,
      );
      expect(log).toEqual(['init BarV2', 'init FooV1 with BarValue = 2']);
      log = [];

      // Let's try this again.
      moduleSystem.__accept(
        1,
        (global, require, importDefault, importAll, module, exports) => {
          log.push('init BarV3');
          module.exports = 3;
        },
        [],
        {1: [0], 0: []},
        undefined,
      );
      expect(log).toEqual(['init BarV3', 'init FooV1 with BarValue = 3']);
      log = [];

      // Now let's edit the parent which accepts itself.
      moduleSystem.__accept(
        0,
        (global, require, importDefault, importAll, module, exports) => {
          const BarValue = require(1);
          log.push('init FooV2 with BarValue = ' + BarValue);
          module.hot.accept();
        },
        [],
        {1: [0], 0: []},
        undefined,
      );
      // It should see a fresh version of the child.
      expect(log).toEqual(['init FooV2 with BarValue = 3']);
      log = [];

      // Verify editing the child didn't break after parent update.
      moduleSystem.__accept(
        1,
        (global, require, importDefault, importAll, module, exports) => {
          log.push('init BarV4');
          module.exports = 4;
        },
        [],
        {1: [0], 0: []},
        undefined,
      );
      expect(log).toEqual(['init BarV4', 'init FooV2 with BarValue = 4']);
      log = [];
    });

    it('provides fresh value for exports.* in parents', () => {
      let log = [];
      createModuleSystem(moduleSystem, true);
      createModule(
        moduleSystem,
        0,
        'foo.js',
        (global, require, importDefault, importAll, module, exports) => {
          const BarValue = require(1).value;
          log.push('init FooV1 with BarValue = ' + BarValue);
          // This module accepts itself:
          module.hot.accept();
        },
      );
      createModule(
        moduleSystem,
        1,
        'bar.js',
        (global, require, importDefault, importAll, module, exports) => {
          log.push('init BarV1');
          exports.value = 1;
          // This module will propagate to the parent.
        },
      );
      moduleSystem.__r(0);
      expect(log).toEqual(['init BarV1', 'init FooV1 with BarValue = 1']);
      log = [];

      // We edited Bar, but it doesn't accept.
      // So we expect it to re-run together with Foo which does.
      moduleSystem.__accept(
        1,
        (global, require, importDefault, importAll, module, exports) => {
          log.push('init BarV2');
          exports.value = 2;
        },
        [],
        {1: [0], 0: []},
        undefined,
      );
      expect(log).toEqual(['init BarV2', 'init FooV1 with BarValue = 2']);
      log = [];

      // Let's try this again.
      moduleSystem.__accept(
        1,
        (global, require, importDefault, importAll, module, exports) => {
          log.push('init BarV3');
          exports.value = 3;
        },
        [],
        {1: [0], 0: []},
        undefined,
      );
      expect(log).toEqual(['init BarV3', 'init FooV1 with BarValue = 3']);
      log = [];

      // Now let's edit the parent which accepts itself.
      moduleSystem.__accept(
        0,
        (global, require, importDefault, importAll, module, exports) => {
          const BarValue = require(1).value;
          log.push('init FooV2 with BarValue = ' + BarValue);
          module.hot.accept();
        },
        [],
        {1: [0], 0: []},
        undefined,
      );
      // It should see a fresh version of the child.
      expect(log).toEqual(['init FooV2 with BarValue = 3']);
      log = [];

      // Verify editing the child didn't break after parent update.
      moduleSystem.__accept(
        1,
        (global, require, importDefault, importAll, module, exports) => {
          log.push('init BarV4');
          exports.value = 4;
        },
        [],
        {1: [0], 0: []},
        undefined,
      );
      expect(log).toEqual(['init BarV4', 'init FooV2 with BarValue = 4']);
      log = [];
    });

    it('provides fresh value for ES6 named import in parents', () => {
      let log = [];
      createModuleSystem(moduleSystem, true);
      createModule(
        moduleSystem,
        0,
        'foo.js',
        (global, require, importDefault, importAll, module, exports) => {
          const BarValue = importAll(1).value;
          log.push('init FooV1 with BarValue = ' + BarValue);
          // This module accepts itself:
          module.hot.accept();
        },
      );
      createModule(
        moduleSystem,
        1,
        'bar.js',
        (global, require, importDefault, importAll, module, exports) => {
          log.push('init BarV1');
          exports.__esModule = true;
          exports.value = 1;
          // This module will propagate to the parent.
        },
      );
      moduleSystem.__r(0);
      expect(log).toEqual(['init BarV1', 'init FooV1 with BarValue = 1']);
      log = [];

      // We edited Bar, but it doesn't accept.
      // So we expect it to re-run together with Foo which does.
      moduleSystem.__accept(
        1,
        (global, require, importDefault, importAll, module, exports) => {
          log.push('init BarV2');
          exports.__esModule = true;
          exports.value = 2;
        },
        [],
        {1: [0], 0: []},
        undefined,
      );
      expect(log).toEqual(['init BarV2', 'init FooV1 with BarValue = 2']);
      log = [];

      // Let's try this again.
      moduleSystem.__accept(
        1,
        (global, require, importDefault, importAll, module, exports) => {
          log.push('init BarV3');
          exports.__esModule = true;
          exports.value = 3;
        },
        [],
        {1: [0], 0: []},
        undefined,
      );
      expect(log).toEqual(['init BarV3', 'init FooV1 with BarValue = 3']);
      log = [];

      // Now let's edit the parent which accepts itself.
      moduleSystem.__accept(
        0,
        (global, require, importDefault, importAll, module, exports) => {
          const BarValue = importAll(1).value;
          log.push('init FooV2 with BarValue = ' + BarValue);
          module.hot.accept();
        },
        [],
        {1: [0], 0: []},
        undefined,
      );
      // It should see a fresh version of the child.
      expect(log).toEqual(['init FooV2 with BarValue = 3']);
      log = [];

      // Verify editing the child didn't break after parent update.
      moduleSystem.__accept(
        1,
        (global, require, importDefault, importAll, module, exports) => {
          log.push('init BarV4');
          exports.__esModule = true;
          exports.value = 4;
        },
        [],
        {1: [0], 0: []},
        undefined,
      );
      expect(log).toEqual(['init BarV4', 'init FooV2 with BarValue = 4']);
      log = [];
    });

    it('provides fresh value for ES6 default import in parents', () => {
      let log = [];
      createModuleSystem(moduleSystem, true);
      createModule(
        moduleSystem,
        0,
        'foo.js',
        (global, require, importDefault, importAll, module, exports) => {
          const BarValue = importDefault(1);
          log.push('init FooV1 with BarValue = ' + BarValue);
          // This module accepts itself:
          module.hot.accept();
        },
      );
      createModule(
        moduleSystem,
        1,
        'bar.js',
        (global, require, importDefault, importAll, module, exports) => {
          log.push('init BarV1');
          exports.__esModule = true;
          exports.default = 1;
          // This module will propagate to the parent.
        },
      );
      moduleSystem.__r(0);
      expect(log).toEqual(['init BarV1', 'init FooV1 with BarValue = 1']);
      log = [];

      // We edited Bar, but it doesn't accept.
      // So we expect it to re-run together with Foo which does.
      moduleSystem.__accept(
        1,
        (global, require, importDefault, importAll, module, exports) => {
          log.push('init BarV2');
          exports.__esModule = true;
          exports.default = 2;
        },
        [],
        {1: [0], 0: []},
        undefined,
      );
      expect(log).toEqual(['init BarV2', 'init FooV1 with BarValue = 2']);
      log = [];

      // Let's try this again.
      moduleSystem.__accept(
        1,
        (global, require, importDefault, importAll, module, exports) => {
          log.push('init BarV3');
          exports.__esModule = true;
          exports.default = 3;
        },
        [],
        {1: [0], 0: []},
        undefined,
      );
      expect(log).toEqual(['init BarV3', 'init FooV1 with BarValue = 3']);
      log = [];

      // Now let's edit the parent which accepts itself.
      moduleSystem.__accept(
        0,
        (global, require, importDefault, importAll, module, exports) => {
          const BarValue = importDefault(1);
          log.push('init FooV2 with BarValue = ' + BarValue);
          module.hot.accept();
        },
        [],
        {1: [0], 0: []},
        undefined,
      );
      // It should see a fresh version of the child.
      expect(log).toEqual(['init FooV2 with BarValue = 3']);
      log = [];

      // Verify editing the child didn't break after parent update.
      moduleSystem.__accept(
        1,
        (global, require, importDefault, importAll, module, exports) => {
          log.push('init BarV4');
          exports.__esModule = true;
          exports.default = 4;
        },
        [],
        {1: [0], 0: []},
        undefined,
      );
      expect(log).toEqual(['init BarV4', 'init FooV2 with BarValue = 4']);
      log = [];
    });

    it('runs custom accept and dispose handlers', () => {
      let log = [];
      createModuleSystem(moduleSystem, true);
      createModule(
        moduleSystem,
        0,
        'foo.js',
        (global, require, importDefault, importAll, module, exports) => {
          module.hot.accept(() => {
            log.push('accept V1');
          });
          module.hot.dispose(() => {
            log.push('dispose V1');
          });
        },
      );
      moduleSystem.__r(0);
      expect(log).toEqual([]);
      log = [];

      moduleSystem.__accept(
        0,
        (global, require, importDefault, importAll, module, exports) => {
          module.hot.accept(() => {
            log.push('accept V2');
          });
          module.hot.dispose(() => {
            log.push('dispose V2');
          });
        },
        [],
        {0: []},
        undefined,
      );

      // TODO: this is existing behavior but it deviates from webpack.
      // In webpack, the "accept" callback only fires on errors in module init.
      // This is because otherwise you might as well put your code directly
      // into the module initialization path.
      // We might want to either align with webpack or intentionally deviate
      // but for now let's test the existing behavior.
      expect(log).toEqual(['dispose V1', 'accept V2']);
      log = [];
    });
  });
});
