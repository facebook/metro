/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @emails oncall+metro_bundler
 * @flow strict-local
 * @format
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
])('comparing basic types', (left, right) => {
  const result = JSON.stringify(
    compareTypeAnnotation(getTypeFromCode(left), getTypeFromCode(right)),
    null,
    '\t',
  );
  expect(`
    left-type:
      ${left}
    right-type:
      ${right}
    output:
      ${result}`).toMatchSnapshot();
});
