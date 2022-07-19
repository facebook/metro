/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @emails oncall+metro_bundler
 * @flow
 * @format
 */

'use strict';

import type {Module} from '../../types.flow';

const multipleFilesRamBundle = require('../multiple-files-ram-bundle');
const {getModuleCodeAndMap} = require('../util');

let code;
let map;
let extraFiles;
let ids, modules, requireCall;
const idsForPath = ({path}: {path: string, ...}) => {
  const id = getId(path);
  return {moduleId: id, localId: id};
};

beforeAll(() => {
  modules = [
    makeModule('a', []),
    makeModule('b'),
    makeModule('c', ['f']),
    makeModule('d', ['e']),
    makeModule('e', ['c']),
    makeModule('f'),
  ];
  requireCall = makeModule('r', [], 'script', 'require(1);');
  ids = new Map(modules.map(({file}, i: number) => [file.path, i]));
  ({code, extraFiles, map} = createRamBundle());
});

it('does not start the bundle file with the magic number (not a binary one)', () => {
  expect(Buffer.from(code).readUInt32LE(0)).not.toBe(0xfb0bd1e5);
});

it('contains the startup code on the main file', () => {
  expect(code).toBe('require(1);');
});

it('creates a source map', () => {
  let line = countLines(requireCall);
  expect(map.sections.slice(1)).toEqual(
    modules.map((m: Module) => {
      const section = {
        map: expectedMap(m) || lineByLineMap(m.file.path),
        offset: {column: 0, line},
      };
      line += countLines(m);
      return section;
    }),
  );
  expect(map.x_facebook_offsets).toEqual([1, 2, 3, 4, 5, 6]);
});

it('creates a magic file with the number', () => {
  expect(extraFiles).toBeDefined();
  // $FlowFixMe "extraFiles" is always defined at this point.
  expect(extraFiles.get('js-modules/UNBUNDLE')).toBeDefined();
  // $FlowFixMe "extraFiles" is always defined at this point.
  expect(extraFiles.get('js-modules/UNBUNDLE').readUInt32LE(0)).toBe(
    0xfb0bd1e5,
  );
});

it('bundles each file separately', () => {
  expect(extraFiles).toBeDefined();

  modules.forEach((module: Module, i: number) => {
    // $FlowFixMe "extraFiles" is always defined at this point.
    expect(extraFiles.get(`js-modules/${i}.js`).toString()).toBe(
      expectedCode(modules[i]),
    );
  });
});

function createRamBundle(
  preloadedModules: Set<string> = new Set(),
  ramGroups?: empty,
) {
  const build = multipleFilesRamBundle.createBuilder(
    preloadedModules,
    ramGroups,
  );
  const result = build({
    filename: 'arbitrary/filename.js',
    globalPrefix: '',
    idsForPath,
    modules,
    requireCalls: [requireCall],
    enableIDInlining: true,
    segmentID: 0,
  });

  return {code: result.code, map: result.map, extraFiles: result.extraFiles};
}

function makeModule(
  name: string,
  deps: Array<string> = [],
  type: string = 'module',
  moduleCode: string = `var ${name};`,
): Module {
  const path = makeModulePath(name);
  return {
    dependencies: deps.map(makeDependency),
    file: {
      code: type === 'module' ? makeModuleCode(moduleCode) : moduleCode,
      map: type !== 'module' ? null : makeModuleMap(name, path),
      functionMap:
        type !== 'module' ? null : {names: ['<global>'], mappings: 'AAA'},
      path,
      // $FlowFixMe[incompatible-return]
      type,
      libraryIdx: null,
    },
  };
}

function makeModuleMap(name: string, path: string) {
  return {
    version: 3,
    mappings: '',
    names: [],
    sources: [path],
    x_facebook_sources: [[null]],
  };
}

function makeModuleCode(moduleCode: string): string {
  return `__d(() => {${moduleCode}})`;
}

function makeModulePath(name: string): string {
  return `/${name}.js`;
}

function makeDependency(name: string) {
  const path = makeModulePath(name);
  return {
    id: name,
    isAsync: false,
    isPrefetchOnly: false,
    path,
    splitCondition: null,
    locs: [],
  };
}

function expectedCodeAndMap(module: Module) {
  return getModuleCodeAndMap(module, x => idsForPath(x).moduleId, {
    dependencyMapReservedName: undefined,
    enableIDInlining: true,
    globalPrefix: '',
  });
}

function expectedCode(module: Module) {
  return expectedCodeAndMap(module).moduleCode;
}

function expectedMap(module: Module) {
  return expectedCodeAndMap(module).moduleMap;
}

function getId(path: string): number {
  if (path === requireCall.file.path) {
    return -1;
  }

  const id = ids.get(path);
  if (id == null) {
    throw new Error(`Unknown file: ${path}`);
  }
  return id;
}

function countLines(module: Module): number {
  return module.file.code.split('\n').length;
}

function lineByLineMap(file: string): {
  file: string,
  mappings: string,
  names: Array<empty>,
  sources: Array<string>,
  version: number,
} {
  return {
    file,
    mappings: '',
    names: [],
    sources: [file],
    version: 3,
  };
}
