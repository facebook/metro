/**
 * Copyright (c) 2016-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 *
 * @flow
 */
'use strict';

declare var jest: any;

const multipleFilesRamBundle = require('../multiple-files-ram-bundle');

const {getModuleCode} = require('../util');

declare var describe: any;
declare var expect: any;
declare var it: (string, () => ?Promise<any>) => void;
declare var beforeAll: (() => ?Promise<any>) => void;

let code;
let map;
let extraFiles;
let ids, modules, requireCall;
const idForPath = ({path}) => getId(path);

beforeAll(() => {
  modules = [
    makeModule('a', [], 'script'),
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
  expect(new Buffer(code).readUInt32LE(0)).not.toBe(0xFB0BD1E5);
});

it('contains the startup code on the main file', () => {
  expect(code).toBe('require(1);');
});

it('creates a source map', () => {
  let line = countLines(requireCall);
  expect(map.sections.slice(1)).toEqual(modules.map(m => {
    const section = {
      map: m.file.map || lineByLineMap(m.file.path),
      offset: {column: 0, line},
    };
    line += countLines(m);
    return section;
  }));
  expect(map.x_facebook_offsets).toEqual([1, 2, 3, 4, 5, 6]);
});

it('creates a magic file with the number', () => {
  expect(extraFiles).toBeDefined();
  // $FlowFixMe "extraFiles" is always defined at this point.
  expect(extraFiles.get('UNBUNDLE')).toBeDefined();
  // $FlowFixMe "extraFiles" is always defined at this point.
  expect(extraFiles.get('UNBUNDLE').readUInt32LE(0)).toBe(0xFB0BD1E5);
});

it('bundles each file separately', () => {
  expect(extraFiles).toBeDefined();

  modules.forEach((module, i) => {
    // $FlowFixMe "extraFiles" is always defined at this point.
    expect(extraFiles.get(`js-modules/${i}.js`).toString())
      .toBe(getModuleCode(modules[i], idForPath));
  });
});

function createRamBundle(preloadedModules = new Set(), ramGroups) {
  const build = multipleFilesRamBundle.createBuilder(preloadedModules, ramGroups);
  const result = build({
    filename: 'arbitrary/filename.js',
    idForPath,
    modules,
    requireCalls: [requireCall],
  });

  return {code: result.code, map: result.map, extraFiles: result.extraFiles};
}

function makeModule(name, deps = [], type = 'module', moduleCode = `var ${name};`) {
  const path = makeModulePath(name);
  return {
    dependencies: deps.map(makeDependency),
    file: {
      code: type === 'module' ? makeModuleCode(moduleCode) : moduleCode,
      map: type !== 'module'
        ? null
        : makeModuleMap(name, path),
      path,
      type,
    },
  };
}

function makeModuleMap(name, path) {
  return {
    version: 3,
    mappings: Array(parseInt(name, 36) + 1).join(','),
    names: [name],
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
    mappings: 'AAAA;',
    names: [],
    sources: [file],
    version: 3,
  };
}
