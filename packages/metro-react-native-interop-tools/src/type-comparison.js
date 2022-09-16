/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow strict-local
 * @format
 * @oncall metro_bundler
 */

import type {
  AnyTypeAnnotation,
  NullableTypeAnnotation,
  LiteralTypeAnnotation,
} from './type-annotation.js';
import type {SourceLocation} from '@babel/types';

type ComparisonResult = $ReadOnly<{
  message: string,
  newTypeLoc: ?SourceLocation,
  oldTypeLoc: ?SourceLocation,
}>;

function removeNullable(annotation: NullableTypeAnnotation) {
  if (annotation.typeAnnotation.type === 'NullableTypeAnnotation') {
    return removeNullable(annotation.typeAnnotation);
  }
  return annotation.typeAnnotation;
}

function getSimplifiedType(annotation: AnyTypeAnnotation): string {
  switch (annotation.type) {
    case 'BooleanTypeAnnotation':
      return 'boolean';
    case 'StringTypeAnnotation':
      return 'string';
    case 'NumberTypeAnnotation':
      return 'number';
    case 'VoidTypeAnnotation':
      return 'void';
    case 'StringLiteralTypeAnnotation':
      return 'string literal';
    case 'NumberLiteralTypeAnnotation':
      return 'number literal';
    case 'BooleanLiteralTypeAnnotation':
      return 'boolean literal';
    case 'NullLiteralTypeAnnotation':
      return 'null';
    case 'NullableTypeAnnotation':
      return `nullable ${getSimplifiedType(removeNullable(annotation))}`;
  }
  throw new Error(annotation.type + ' is not supported');
}

export function compareTypeAnnotation(
  left: AnyTypeAnnotation,
  right: AnyTypeAnnotation,
  isInFunctionReturn: boolean,
): Array<ComparisonResult> {
  switch (left.type) {
    case 'BooleanTypeAnnotation':
      if (
        right.type === left.type ||
        right.type === 'BooleanLiteralTypeAnnotation'
      ) {
        return [];
      }
      return [basicError(left, right, isInFunctionReturn)];
    case 'NumberTypeAnnotation':
      if (
        left.type === right.type ||
        right.type === 'NumberLiteralTypeAnnotation'
      ) {
        return [];
      }
      return [basicError(left, right, isInFunctionReturn)];
    case 'StringTypeAnnotation':
      if (
        left.type === right.type ||
        right.type === 'StringLiteralTypeAnnotation'
      ) {
        return [];
      }
      return [basicError(left, right, isInFunctionReturn)];
    case 'VoidTypeAnnotation':
      if (right.type === 'VoidTypeAnnotation') {
        return [];
      }
      return [basicError(left, right, isInFunctionReturn)];
    case 'StringLiteralTypeAnnotation':
    case 'BooleanLiteralTypeAnnotation':
    case 'NumberLiteralTypeAnnotation':
      if (right.type === left.type) {
        if (right.value === left.value) {
          return [];
        }
        return [literalError(left, right, isInFunctionReturn)];
      }
      return [basicError(left, right, isInFunctionReturn)];
    case 'NullLiteralTypeAnnotation':
      if (right.type !== 'NullLiteralTypeAnnotation') {
        return [basicError(left, right, isInFunctionReturn)];
      }
      return [];
    case 'NullableTypeAnnotation':
      if (right.type === 'NullableTypeAnnotation') {
        return compareTypeAnnotation(
          left.typeAnnotation,
          right.typeAnnotation,
          isInFunctionReturn,
        );
      }
      if (
        right.type === 'NullLiteralTypeAnnotation' ||
        right.type === 'VoidTypeAnnotation'
      ) {
        return [];
      }
      return compareTypeAnnotation(
        left.typeAnnotation,
        right,
        isInFunctionReturn,
      );
    default:
      throw new Error(left.type + 'is not supported');
  }
}

function basicError(
  left: AnyTypeAnnotation,
  right: AnyTypeAnnotation,
  isInFunctionReturn: boolean,
): ComparisonResult {
  const newAnnotationType = isInFunctionReturn ? left : right;
  const oldAnnotationType = isInFunctionReturn ? right : left;
  const newType = getSimplifiedType(newAnnotationType);
  const oldType = getSimplifiedType(oldAnnotationType);
  const reason = isInFunctionReturn
    ? 'is incompatible with what the native code returns'
    : 'native code will break when js calls it';
  return {
    message: `Error: cannot change ${oldType} to ${newType} because ${reason}.`,
    newTypeLoc: newAnnotationType.loc,
    oldTypeLoc: oldAnnotationType.loc,
  };
}

function getValueFromType(annotation: LiteralTypeAnnotation): string {
  if (annotation.type === 'StringLiteralTypeAnnotation') {
    return annotation.value;
  }
  return JSON.stringify(annotation.value);
}

function literalError(
  left: LiteralTypeAnnotation,
  right: LiteralTypeAnnotation,
  isInFunctionReturn: boolean,
): ComparisonResult {
  const newAnnotationType = isInFunctionReturn ? left : right;
  const oldAnnotationType = isInFunctionReturn ? right : left;
  const newType = getSimplifiedType(newAnnotationType);
  const oldType = getSimplifiedType(oldAnnotationType);
  const newValue = getValueFromType(newAnnotationType);
  const oldValue = getValueFromType(oldAnnotationType);
  const reason = isInFunctionReturn
    ? 'is incompatible with what the native code returns'
    : 'native code will break when js calls it';
  return {
    message: `Error: cannot change ${oldType} with value '${oldValue}' to ${newType} with value '${newValue}' because ${reason}.`,
    newTypeLoc: newAnnotationType.loc,
    oldTypeLoc: oldAnnotationType.loc,
  };
}
