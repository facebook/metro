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
import type {File, Dependency} from '../../types.flow';

import type {IndexMapSection} from 'metro-source-map';

const indexedRamBundle = require('../indexed-ram-bundle');
const {getModuleCodeAndMap} = require('../util');

declare var describe: any;
declare var expect: any;
declare var it: (string, () => ?Promise<any>) => void;
declare var beforeAll: (() => ?Promise<any>) => void;

let code: Buffer;
let map;
let ids, modules, requireCall;
const idsForPath = ({path}: File | {path: string, ...}) => {
  const id = getId(path);
  return {moduleId: id, localId: id};
};

beforeAll(() => {
  modules = [
    makeModule('a', []),
    makeModule('b', ['c']),
    makeModule('c', ['f']),
    makeModule('d', ['e']),
    makeModule('e'),
    makeModule('f'),
  ];
  requireCall = makeModule('r', [], 'script', 'require(1);');

  ids = new Map(modules.map(({file}, i: number) => [file.path, i]));
  ({code, map} = createRamBundle());
});

it('starts the bundle file with the magic number', () => {
  expect(code.readUInt32LE(0)).toBe(0xfb0bd1e5);
});

it('contains the number of modules in the module table', () => {
  expect(code.readUInt32LE(SIZEOF_INT32)).toBe(modules.length);
});

it('has the length correct of the startup section', () => {
  expect(code.readUInt32LE(SIZEOF_INT32 * 2)).toBe(
    requireCall.file.code.length + 1,
  );
});

it('contains the code after the offset table', () => {
  const {codeOffset, startupSectionLength, table} = parseOffsetTable(code);

  const startupSection = code.slice(
    codeOffset,
    codeOffset + startupSectionLength - 1,
  );
  expect(startupSection.toString()).toBe(requireCall.file.code);

  table.forEach(([offset, length], i: number) => {
    const moduleCode = code.slice(
      codeOffset + offset,
      codeOffset + offset + length - 1,
    );
    expect(moduleCode.toString()).toBe(expectedCode(modules[i]));
  });
});

it('creates a source map', () => {
  let line = countLines(requireCall);
  expect(map.sections.slice(1)).toEqual(
    modules.map(m => {
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

describe('Startup section optimization', () => {
  let last, preloaded;
  beforeAll(() => {
    last = modules[modules.length - 1];
    preloaded = [modules[2], modules[3], last];
    ({code, map} = createRamBundle(new Set(preloaded.map(getPath))));
  });

  it('supports additional modules in the startup section', () => {
    const {codeOffset, startupSectionLength, table} = parseOffsetTable(code);

    const startupSection = code.slice(
      codeOffset,
      codeOffset + startupSectionLength - 1,
    );
    expect(startupSection.toString()).toBe(
      preloaded.concat([requireCall]).map(expectedCode).join('\n'),
    );

    preloaded.forEach(m => {
      const idx = idsForPath(m.file).moduleId;
      expect(table[idx]).toEqual(m === last ? undefined : [0, 0]);
    });

    table.forEach(([offset, length], i: number) => {
      if (offset !== 0 && length !== 0) {
        const moduleCode = code.slice(
          codeOffset + offset,
          codeOffset + offset + length - 1,
        );
        expect(moduleCode.toString()).toBe(expectedCode(modules[i]));
      }
    });
  });

  it('reflects additional sources in the startup section in the source map', () => {
    let line = preloaded.reduce(
      (l: number, m) => l + countLines(m),
      countLines(requireCall),
    );

    expect(map.x_facebook_offsets).toEqual([4, 5, undefined, undefined, 6]);

    expect(map.sections.slice(1)).toEqual(
      // $FlowFixMe[method-unbinding] added when improving typing for this parameters
      modules.filter(not(Set.prototype.has), new Set(preloaded)).map(m => {
        const section = {
          map: expectedMap(m) || lineByLineMap(m.file.path),
          offset: {column: 0, line},
        };
        line += countLines(m);
        return section;
      }),
    );
  });
});

describe('RAM groups / common sections', () => {
  let groups, groupHeads;
  beforeAll(() => {
    groups = [
      [modules[1], modules[2], modules[5]],
      [modules[3], modules[4]],
    ];
    groupHeads = groups.map(g => g[0]);
    ({code, map} = createRamBundle(undefined, groupHeads.map(getPath)));
  });

  it('supports grouping the transitive dependencies of files into common sections', () => {
    const {codeOffset, table} = parseOffsetTable(code);

    groups.forEach(group => {
      const [head, ...deps] = group.map(x => idsForPath(x.file).moduleId);
      const groupEntry = table[head];
      deps.forEach(id => expect(table[id]).toEqual(groupEntry));

      const [offset, length] = groupEntry;
      const groupCode = code.slice(
        codeOffset + offset,
        codeOffset + offset + length - 1,
      );
      expect(groupCode.toString()).toEqual(group.map(expectedCode).join('\n'));
    });
  });

  it('reflects section groups in the source map', () => {
    expect(map.x_facebook_offsets).toEqual([1, 2, 2, 5, 5, 2]);
    const maps = map.sections.slice(-2);
    const toplevelOffsets = [2, 5];

    maps
      .map((groupMap: IndexMapSection, i: number) => [groups[i], groupMap])
      .forEach(([group, groupMap], i: number) => {
        const offsets = group.reduce(moduleLineOffsets, [])[0];
        expect(groupMap).toEqual({
          map: {
            version: 3,
            sections: group.map((module, j) => ({
              map: expectedMap(module),
              offset: {line: offsets[j], column: 0},
            })),
          },
          offset: {line: toplevelOffsets[i], column: 0},
        });
      });
  });

  function moduleLineOffsets(
    /* $FlowFixMe[missing-local-annot] The type annotation(s) required by
     * Flow's LTI update could not be added via codemod */
    [offsets = [], line = 0],
    module: {dependencies: Array<Dependency>, file: File},
  ) {
    return [[...offsets, line], line + countLines(module)];
  }
});

function createRamBundle(
  preloadedModules: Set<string> = new Set(),
  ramGroups: void | Array<string>,
) {
  const build = indexedRamBundle.createBuilder(preloadedModules, ramGroups);
  const result = build({
    filename: 'arbitrary/filename.js',
    globalPrefix: '',
    idsForPath,
    // $FlowFixMe[incompatible-call]
    modules,
    requireCalls: [requireCall],
    enableIDInlining: true,
    segmentID: 0,
  });

  if (typeof result.code === 'string') {
    throw new Error('Expected a buffer, not a string');
  }
  return {code: result.code, map: result.map};
}

function makeModule(
  name: string,
  deps: Array<string> = [],
  type: string = 'module',
  moduleCode: string = `var ${name};`,
) {
  const path = makeModulePath(name);
  return {
    dependencies: deps.map(makeDependency),
    file: {
      code: type === 'module' ? makeModuleCode(moduleCode) : moduleCode,
      map: type !== 'module' ? null : makeModuleMap(name, path),
      functionMap:
        type !== 'module' ? null : {names: ['<global>'], mappings: 'AAA'},
      path,
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

function makeModuleCode(moduleCode: string) {
  return `__d(() => {${moduleCode}})`;
}

function makeModulePath(name: string) {
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

function expectedCodeAndMap(module: {
  dependencies: Array<Dependency>,
  file: File,
}) {
  return getModuleCodeAndMap(module, x => idsForPath(x).moduleId, {
    dependencyMapReservedName: undefined,
    enableIDInlining: true,
    globalPrefix: '',
  });
}

function expectedCode(module: {dependencies: Array<Dependency>, file: File}) {
  return expectedCodeAndMap(module).moduleCode;
}

function expectedMap(module: {dependencies: Array<Dependency>, file: File}) {
  return expectedCodeAndMap(module).moduleMap;
}

function getId(path: string) {
  if (path === requireCall.file.path) {
    return -1;
  }

  const id = ids.get(path);
  if (id == null) {
    throw new Error(`Unknown file: ${path}`);
  }
  return id;
}

function getPath(module: {dependencies: Array<Dependency>, file: File}) {
  return module.file.path;
}

const SIZEOF_INT32 = 4;
function parseOffsetTable(buffer: Buffer) {
  const n = buffer.readUInt32LE(SIZEOF_INT32);
  const startupSectionLength = buffer.readUInt32LE(SIZEOF_INT32 * 2);
  const baseOffset = SIZEOF_INT32 * 3;
  const table = Array(n);
  for (let i = 0; i < n; ++i) {
    const offset = baseOffset + i * 2 * SIZEOF_INT32;
    table[i] = [
      buffer.readUInt32LE(offset),
      buffer.readUInt32LE(offset + SIZEOF_INT32),
    ];
  }
  return {
    codeOffset: baseOffset + n * 2 * SIZEOF_INT32,
    startupSectionLength,
    table,
  };
}

function countLines(module: {
  dependencies: Array<Dependency>,
  file: File,
}): number {
  return module.file.code.split('\n').length;
}

function lineByLineMap(file: string) {
  return {
    file,
    mappings: '',
    names: [],
    sources: [file],
    version: 3,
  };
}

const not = (fn: (value: mixed) => boolean) =>
  function () {
    return !fn.apply(this, arguments);
  };
