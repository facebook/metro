/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow strict-local
 * @format
 * @oncall react_native
 */

import {parse} from 'hermes-parser';
import {getTypeAnnotation} from '../ast-helpers.js';
import {compareTypeAnnotation} from '../type-comparison.js';
import type {AnyTypeAnnotation} from '../type-annotation.js';
import type {FlowType, Statement} from '@babel/types';

function getTypeFromAlias(body: Statement): FlowType {
  if (body.type !== 'TypeAlias') {
    throw new Error('This function support only TypeAlias');
  }
  return body.right;
}

function getTypeFromCode(stringType: string): AnyTypeAnnotation {
  const ast = parse('type T =' + stringType, {
    babel: true,
    sourceType: 'module',
    sourceFilename: 'NativeDeviceManager.js',
  });
  const astType = getTypeFromAlias(ast.program.body[0]);
  return getTypeAnnotation(astType);
}

test.each([
  ['boolean', 'boolean'],
  ['string', 'string'],
  ['number', 'number'],
  ['void', 'void'],
  ['boolean', 'number'],
  ["'a'", "'a'"],
  ["'a'", "'b'"],
  ['8', '8'],
  ['2', '8'],
  ['2', 'number'],
  ['number', '2'],
  ['string', "'a'"],
  ["'a'", 'string'],
  ['true', 'true'],
  ['true', 'false'],
  ['string', '?string'],
  ['?number', 'number'],
  ['?boolean', 'true'],
  ['?string', '?string'],
  ['?string', "?'foo'"],
  ['?string', '?number'],
  ['null', 'null'],
  ['?string', 'null'],
  ['?boolean', 'void'],
  ['() => boolean', '() => ?boolean'],
  ['() => ?boolean', '() => boolean'],
  ['() => true', '() => boolean'],
  ['(test: ?boolean) => true', '(test: boolean) => true'],
  ['(test?: string) => void', '() => void'],
  ['(test: string) => void', '() => void'],
  ['() => void', '(test?: string) => void'],
  ['() => void', '(test?: string, test2: number) => void'],
  ['(test?: boolean) => true', '(test?: string) => true'],
  ['(test: string) => ?true', '() => void'],
  ['{name: string, age: ?number }', '{name: string, age: number }'],
  ['{name: string, age: number }', '{name: string, age?: number }'],
  ['{name: string, age: number }', '{name: string}'],
  ['{name: string, age?: number }', '{name: string}'],
  ['{name: string}', '{name: string, ...}'],
  ['{name: string}', '{name: string, age: number}'],
  ['{name: string}', '{name: string, age?: number}'],
  ['() => {name: string, age?: number }', '() => {name: string}'],
  ['() => {name: string, age: number }', '() => {name: string}'],
  ['() => {name: string}', '() => {name: string, age: number}'],
  ['() => {name: string}', '() => {name: string, age: ?number}'],
])('comparing basic types', (left, right) => {
  const result = compareTypeAnnotation(
    getTypeFromCode(left),
    getTypeFromCode(right),
    false,
  );
  let messages: string = '';
  result.forEach(error => {
    messages = messages + error.message + '\n  \t\t';
  });
  messages = messages === '' ? 'no errors' : messages;
  expect(`
    left-type:
      ${left}
    right-type:
      ${right}
    output:
      ${messages}`).toMatchSnapshot();
});
