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
      message: `Expected ${received} to equal ${built}`,
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
    expect(dependenciesDot({modules: [
      createModule('a', ['b']),
      createModule('b', ['c']),
      createModule('c', []),
    ]})).toBeAMultilineString(
      'digraph {',
      '\t"a" -> "b";',
      '\t"b" -> "c";',
      '}',
    );
  });

  it('writes one entry per dependency', () => {
    expect(dependenciesDot({modules: [
      createModule('a', ['b', 'c']),
      createModule('b', ['d']),
      createModule('c', []),
      createModule('d', []),
    ]})).toBeAMultilineString(
      'digraph {',
      '\t"a" -> "b";',
      '\t"a" -> "c";',
      '\t"b" -> "d";',
      '}',
    );
  });

  it('handles non-printable characters', () => {
    expect(dependenciesDot({modules: [
      createModule('"\n', ['\r\t']),
      createModule('\r\t', []),
    ]})).toBeAMultilineString(
      'digraph {',
      '\t"\\"\\n" -> "\\r\\t";',
      '}',
    );
  });

  it('handles circular dependencies', () => {
    expect(dependenciesDot({modules: [
      createModule('a', ['b']),
      createModule('b', ['a']),
    ]})).toBeAMultilineString(
      'digraph {',
      '\t"a" -> "b";',
      '\t"b" -> "a";',
      '}',
    );
  });
});

function createModule(path: string, deps: Array<string>) {
  return {
    file: {code: '', map: null, path, type: 'module'},
    dependencies: deps.map(d => ({id: d, path: d})),
  };
}
