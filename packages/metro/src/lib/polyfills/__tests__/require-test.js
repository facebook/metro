/**
 * Copyright (c) 2016-present, Facebook, Inc.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @emails oncall+javascript_foundation
 * @format
 */

'use strict';

const fs = require('fs');

const {transformSync} = require('@babel/core');

// Include the external-helpers plugin to be able to detect if they're
// needed when transforming the requirejs implementation.
const PLUGINS = ['@babel/plugin-external-helpers'];

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
      plugins: PLUGINS.map(require),
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
    // Super-simple check to validate that no babel helpers are used.
    // This check will need to be updated if https://fburl.com/6z0y2kf8 changes.
    expect(moduleSystemCode.includes('babelHelpers')).toBe(false);
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

    it('exposes module.id as path on the module in dev mode', () => {
      createModuleSystem(moduleSystem, true);

      createModule(
        moduleSystem,
        0,
        'index.js',
        (global, require, importDefault, importAll, module) => {
          module.exports = module.id;
        },
      );

      expect(moduleSystem.__r(0)).toEqual('index.js');
    });

    it("doesn't expose module.id as moduleId on the module in prod mode", () => {
      createModuleSystem(moduleSystem, false);

      createModule(
        moduleSystem,
        0,
        'index.js',
        (global, require, importDefault, importAll, module) => {
          module.exports = module.id;
        },
      );

      expect(moduleSystem.__r(0)).toBeUndefined();
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

    it('calls the hooks when module is required', () => {
      createModuleSystem(moduleSystem, false);

      const received = [];
      const hook = moduleSystem.__r.registerHook((moduleId, module) => {
        received.push([moduleId, module]);
      });
      createModule(
        moduleSystem,
        0,
        'index.js',
        (global, require, _1, _2, module) => {
          module.exports = 'foo';
        },
      );
      createModule(
        moduleSystem,
        1,
        'bar.js',
        (global, require, _1, _2, module) => {
          module.exports = 'bar';
        },
      );

      expect(moduleSystem.__r(0)).toEqual('foo');
      hook.release();
      expect(moduleSystem.__r(1)).toEqual('bar');
      expect(received).toEqual([[0, {exports: 'foo'}]]);
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
});
