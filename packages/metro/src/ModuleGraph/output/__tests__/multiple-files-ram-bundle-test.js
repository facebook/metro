/**
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @emails oncall+javascript_foundation
 * @flow
 * @format
 */

'use strict';

declare var jest: any;

const multipleFilesRamBundle = require('../multiple-files-ram-bundle');

const {getModuleCodeAndMap} = require('../util');

import type {Module} from '../../types.flow';

declare var describe: any;
declare var expect: any;
declare var it: (string, () => ?Promise<any>) => void;
declare var beforeAll: (() => ?Promise<any>) => void;

let code;
let map;
let extraFiles;
let ids, modules, requireCall;
const idsForPath = ({path}) => {
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
  ids = new Map(modules.map(({file}, i) => [file.path, i]));
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
    modules.map(m => {
      const section = {
        map: m.file.map || lineByLineMap(m.file.path),
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

  modules.forEach((module, i) => {
    // $FlowFixMe "extraFiles" is always defined at this point.
    expect(extraFiles.get(`js-modules/${i}.js`).toString()).toBe(
      getModuleCodeAndMap(modules[i], x => idsForPath(x).moduleId, {
        enableIDInlining: true,
      }).moduleCode,
    );
  });
});

function createRamBundle(preloadedModules = new Set(), ramGroups) {
  const build = multipleFilesRamBundle.createBuilder(
    preloadedModules,
    ramGroups,
  );
  const result = build({
    filename: 'arbitrary/filename.js',
    idsForPath,
    modules,
    requireCalls: [requireCall],
    enableIDInlining: true,
    segmentID: 0,
  });

  return {code: result.code, map: result.map, extraFiles: result.extraFiles};
}

function makeModule(
  name,
  deps = [],
  type = 'module',
  moduleCode = `var ${name};`,
): Module {
  const path = makeModulePath(name);
  return {
    dependencies: deps.map(makeDependency),
    file: {
      code: type === 'module' ? makeModuleCode(moduleCode) : moduleCode,
      map: type !== 'module' ? null : makeModuleMap(name, path),
      path,
      type,
      libraryIdx: null,
    },
  };
}

function makeModuleMap(name, path) {
  return {
    version: 3,
    mappings: '',
    names: [],
    sources: [path],
  };
}

function makeModuleCode(moduleCode) {
  return `__d(() => {${moduleCode}})`;
}

function makeModulePath(name) {
  return `/${name}.js`;
}

function makeDependency(name) {
  const path = makeModulePath(name);
  return {
    id: name,
    isAsync: false,
    isPrefetchOnly: false,
    path,
  };
}

function getId(path) {
  if (path === requireCall.file.path) {
    return -1;
  }

  const id = ids.get(path);
  if (id == null) {
    throw new Error(`Unknown file: ${path}`);
  }
  return id;
}

function countLines(module) {
  return module.file.code.split('\n').length;
}

function lineByLineMap(file) {
  return {
    file,
    mappings: '',
    names: [],
    sources: [file],
    version: 3,
  };
}
