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

import type {AnyTypeAnnotation} from './type-annotation.js';

function makeError(
  status: 'incompatible-types' | 'unknown-types',
  left: AnyTypeAnnotation,
  right: AnyTypeAnnotation,
): string {
  if (status === 'incompatible-types') {
    return `Error: ${right.type} cannot be assigned to ${left.type}`;
  }
  throw new Error(left.type + ' is not supported');
}

export function compareTypeAnnotation(
  left: AnyTypeAnnotation,
  right: AnyTypeAnnotation,
): $ReadOnlyArray<string> {
  switch (left.type) {
    case 'BooleanTypeAnnotation':
      if (
        right.type === left.type ||
        right.type === 'BooleanLiteralTypeAnnotation'
      ) {
        return [];
      }
      return [makeError('incompatible-types', left, right)];
    case 'NumberTypeAnnotation':
      if (
        left.type === right.type ||
        right.type === 'NumberLiteralTypeAnnotation'
      ) {
        return [];
      }
      return [makeError('incompatible-types', left, right)];
    case 'StringTypeAnnotation':
      if (
        left.type === right.type ||
        right.type === 'StringLiteralTypeAnnotation'
      ) {
        return [];
      }
      return [makeError('incompatible-types', left, right)];
    case 'VoidTypeAnnotation':
      if (right.type === 'VoidTypeAnnotation') {
        return [];
      }
      return [makeError('incompatible-types', left, right)];
    case 'StringLiteralTypeAnnotation':
      if (
        right.type === 'StringLiteralTypeAnnotation' &&
        right.value === left.value
      ) {
        return [];
      }
      return [makeError('incompatible-types', left, right)];
    case 'NumberLiteralTypeAnnotation':
      if (
        right.type === 'NumberLiteralTypeAnnotation' &&
        right.value === left.value
      ) {
        return [];
      }
      return [makeError('incompatible-types', left, right)];
    case 'BooleanLiteralTypeAnnotation':
      if (
        right.type === 'BooleanLiteralTypeAnnotation' &&
        right.value === left.value
      ) {
        return [];
      }
      return [makeError('incompatible-types', left, right)];
    case 'NullLiteralTypeAnnotation':
      if (right.type !== 'NullLiteralTypeAnnotation') {
        return [makeError('incompatible-types', left, right)];
      }
      return [];
    case 'NullableTypeAnnotation':
      if (right.type === 'NullableTypeAnnotation') {
        return compareTypeAnnotation(left.typeAnnotation, right.typeAnnotation);
      }
      if (
        right.type === 'NullLiteralTypeAnnotation' ||
        right.type === 'VoidTypeAnnotation'
      ) {
        return [];
      }
      return compareTypeAnnotation(left.typeAnnotation, right);
    default:
      return [makeError('unknown-types', left, right)];
  }
}
