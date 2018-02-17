/**
 * Copyright (c) 2016-present, Facebook, Inc.
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

const dependenciesDot = require('../dependencies-dot');

declare var describe: any;
declare var expect: any;
declare var it: (string, () => ?Promise<any>) => void;
declare var beforeAll: (() => ?Promise<any>) => void;

expect.extend({
  toBeAMultilineString(received, ...args) {
    const built = args.join('\n');

    return {
      pass: received === built,
      message: () => `Expected ${received} to equal ${built}`,
    };
  },
});

describe('dependencies-dot', () => {
  it('produces a valid digraph file for an empty set of modules', () => {
    expect(dependenciesDot({modules: []})).toBeAMultilineString(
      'digraph {',
      '}',
    );
  });

  it('produces an ordered file for a standard list of modules', () => {
    const modules = [
      createModule('a', ['b']),
      createModule('b', ['c']),
      createModule('c', []),
    ];
    expect(dependenciesDot({modules})).toBeAMultilineString(
      'digraph {',
      '\t"a" -> "b";',
      '\t"b" -> "c";',
      ...metadata(modules),
      '}',
    );
  });

  it('writes one entry per dependency', () => {
    const modules = [
      createModule('a', ['b', 'c']),
      createModule('b', ['d']),
      createModule('c', []),
      createModule('d', []),
    ];
    expect(
      dependenciesDot({
        modules,
      }),
    ).toBeAMultilineString(
      'digraph {',
      '\t"a" -> "b";',
      '\t"a" -> "c";',
      '\t"b" -> "d";',
      ...metadata(modules),
      '}',
    );
  });

  it('handles non-printable characters', () => {
    const modules = [createModule('"\n', ['\r\t']), createModule('\r\t', [])];
    expect(
      dependenciesDot({
        modules,
      }),
    ).toBeAMultilineString(
      'digraph {',
      '\t"\\"\\n" -> "\\r\\t";',
      ...metadata(modules),
      '}',
    );
  });

  it('handles circular dependencies', () => {
    const modules = [createModule('a', ['b']), createModule('b', ['a'])];
    expect(
      dependenciesDot({
        modules,
      }),
    ).toBeAMultilineString(
      'digraph {',
      '\t"a" -> "b";',
      '\t"b" -> "a";',
      ...metadata(modules),
      '}',
    );
  });
});

function createModule(path: string, deps: Array<string>) {
  return {
    file: {
      code: `var path = ${JSON.stringify(path)};`,
      map: null,
      path,
      type: 'module',
    },
    dependencies: deps.map(d => ({id: d, path: d, isAsync: false})),
  };
}

function metadata(modules) {
  return modules.map(
    m => `\t${JSON.stringify(m.file.path)}[fb_size=${m.file.code.length}];`,
  );
}
