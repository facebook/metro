/**
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @emails oncall+javascript_foundation
 * @format
 */

'use strict';

const {inlineModuleIds, createIdForPathFn} = require('../util');

const {any} = jasmine;

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
