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

const {
  addModuleIdsToModuleWrapper,
  inlineModuleIds,
  createIdForPathFn,
  getModuleCodeAndMap,
} = require('../util');

const {any} = jasmine;

describe('addModuleIdsToModuleWrapper', () => {
  const path = 'path/to/file';
  const createModule = (dependencies = []) => ({
    dependencies,
    file: {code: '__d(function(){});', isModule: true, path},
  });

  it('completes the module wrapped with module ID, and an array of dependency IDs', () => {
    const dependencies = [
      {id: 'a', path: 'path/to/a.js'},
      {id: 'b', path: 'location/of/b.js'},
    ];
    const module = createModule(dependencies);

    const idForPath = jest.fn().mockImplementation(({path: inputPath}) => {
      switch (inputPath) {
        case path:
          return 12;
        case dependencies[0].path:
          return 345;
        case dependencies[1].path:
          return 6;
      }

      throw new Error(`Unexpected path: ${inputPath}`);
    });

    expect(addModuleIdsToModuleWrapper(module, idForPath)).toEqual(
      '__d(function(){},12,[345,6]);',
    );
  });

  it('omits the array of dependency IDs if it is empty', () => {
    const module = createModule();
    expect(addModuleIdsToModuleWrapper(module, () => 98)).toEqual(
      `__d(function(){},${98});`,
    );
  });
});

describe('`inlineModuleIds`:', () => {
  const path = 'path/to/file';

  const basicCode = `
    __d(function(require, depMap) {
      require(depMap[0]);
      require(depMap[1]);
    });
  `;

  const createModule = (dependencies = []) => ({
    dependencies,
    file: {code: basicCode, isModule: true, path},
  });

  const reUsedVariableCode = `
    __d(function(require, depMap) {
      function anotherScope(depMap) {
        return depMap++;
      }
    });
  `;

  const createReUsedVariableModule = (dependencies = []) => ({
    dependencies,
    file: {code: reUsedVariableCode, isModule: true, path},
  });

  it('inlines module ids', () => {
    const dependencies = [
      {id: 'a', path: 'path/to/a.js'},
      {id: 'b', path: 'location/of/b.js'},
    ];

    const module = createModule(dependencies);

    const idForPath = jest.fn().mockImplementation(({path: inputPath}) => {
      switch (inputPath) {
        case path:
          return 12;
        case dependencies[0].path:
          return 345;
        case dependencies[1].path:
          return 6;
      }

      throw new Error(`Unexpected path: ${inputPath}`);
    });

    expect(inlineModuleIds(module, idForPath).moduleCode).toEqual(
      '__d(function(require,depMap){require(345);require(6);},12);',
    );
  });

  it('avoids inlining if the variable is in a different scope', () => {
    const module = createReUsedVariableModule();

    expect(inlineModuleIds(module, () => 98).moduleCode).toEqual(
      '__d(function(require,depMap){function anotherScope(depMap){return depMap++;}},98);',
    );
  });
});

describe('`createIdForPathFn`', () => {
  let idForPath;
  beforeEach(() => {
    idForPath = createIdForPathFn();
  });

  it('returns a number for a string', () => {
    expect(idForPath({path: 'arbitrary'})).toEqual(any(Number));
  });

  it('returns consecutive numbers', () => {
    const strings = [
      'arbitrary string',
      'looking/like/a/path',
      '/absolute/path/to/file.js',
      '/more files/are here',
    ];

    strings.forEach((string, i) => {
      expect(idForPath({path: string})).toEqual(i);
    });
  });

  it('returns the same id if the same string is passed in again', () => {
    const path = 'this/is/an/arbitrary/path.js';
    const id = idForPath({path});
    idForPath({path: '/other/file'});
    idForPath({path: 'and/another/file'});
    expect(idForPath({path})).toEqual(id);
  });
});

describe('getModuleCodeAndMap', () => {
  it('returns empty x_facebook_sources field when map has no sources', () => {
    const {moduleMap} = getModuleCodeAndMap(
      {
        dependencies: [],
        file: {
          code: '__d(function(){});',
          map: {
            version: 3,
            mappings: '',
            names: [],
            sources: [],
          },
          functionMap: {
            mappings: '',
            names: [],
          },
          path: 'path/to/file',
          type: 'module',
          libraryIdx: null,
        },
      },
      () => 0,
      {enableIDInlining: false},
    );
    expect(moduleMap.x_facebook_sources).toEqual([]);
  });

  it('omits x_facebook_sources field entirely when map is sectioned', () => {
    const {moduleMap} = getModuleCodeAndMap(
      {
        dependencies: [],
        file: {
          code: '__d(function(){});',
          map: {
            version: 3,
            sections: [],
          },
          functionMap: {
            mappings: '',
            names: [],
          },
          path: 'path/to/file',
          type: 'module',
          libraryIdx: null,
        },
      },
      () => 0,
      {enableIDInlining: false},
    );
    expect(moduleMap.x_facebook_sources).toEqual(undefined);
  });
});
