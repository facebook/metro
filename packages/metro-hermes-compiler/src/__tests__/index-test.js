/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow
 * @format
 * @oncall react_native
 */

'use strict';

let compile, validateBytecodeModule;

beforeEach(() => {
  jest.resetModules();

  ({compile, validateBytecodeModule} = require('../index'));
});

it('compiles source code to bytecode', () => {
  const sourceCode =
    "'use strict'; function hello() { return 'Banana Banana Banana'; } hello();";
  const {bytecode} = compile(sourceCode, {sourceURL: 'test.js'});

  expect(bytecode.byteLength > 0).toBe(true);
  expect(() => validateBytecodeModule(bytecode, 0)).not.toThrow();
});

it('generates identical bytecode for the same input', () => {
  const sourceCode =
    "'use strict'; function hello() { return 'Banana Banana Banana'; } hello();";

  const result1 = compile(sourceCode, {sourceURL: 'test.js'});
  const result2 = compile(sourceCode, {sourceURL: 'test.js'});
  expect(Buffer.compare(result1.bytecode, result2.bytecode)).toBe(0);
});

it('throws syntax errors as exceptions', () => {
  const sourceCode =
    "'use strict'; function hello() { return 'Banana Banana Banana'; hello();";

  return expect(() => compile(sourceCode, {sourceURL: 'test.js'})).toThrowError(
    "1:73:'}' expected at end of block",
  );
});

it('does not set a global listener for uncaughtException', () => {
  const listenerCountBefore = process.listenerCount('uncaughtException');
  jest.resetModules();
  require('../index');
  expect(process.listenerCount('uncaughtException')).toBe(listenerCountBefore);
});
