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
  FunctionTypeAnnotation,
  FunctionTypeParam,
  ObjectTypeProperty,
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
    case 'FunctionTypeAnnotation':
      return 'function';
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
    case 'FunctionTypeAnnotation':
      if (right.type === 'FunctionTypeAnnotation') {
        return compareFunctionType(left, right, isInFunctionReturn);
      }
      return [basicError(left, right, isInFunctionReturn)];
    default:
      throw new Error(left.type + 'is not supported');
  }
}

function compareFunctionType(
  left: FunctionTypeAnnotation,
  right: FunctionTypeAnnotation,
  isInFunctionReturn: boolean,
): Array<ComparisonResult> {
  /*
   * For the returned type comparison the comparison should be made
   * other way around, because it will return from native something
   * instead of native to be called from js
   */
  const finalResult = [];
  finalResult.push(
    ...compareTypeAnnotation(
      right.returnTypeAnnotation,
      left.returnTypeAnnotation,
      true,
    ),
  );
  let minimumLength = right.params.length;
  if (left.params.length < right.params.length) {
    minimumLength = left.params.length;
    for (let index = left.params.length; index < right.params.length; ++index) {
      if (right.params[index].optional !== true) {
        finalResult.push(
          addedRequiredParamError(left, right.params[index].typeAnnotation),
        );
      }
    }
  }
  for (let index = 0; index < minimumLength; ++index) {
    finalResult.push(
      ...compareTypeAnnotation(
        left.params[index].typeAnnotation,
        right.params[index].typeAnnotation,
        isInFunctionReturn,
      ),
    );
    if (
      left.params[index].optional === false &&
      right.params[index].optional === true
    ) {
      finalResult.push(
        optionalError(
          left.params[index],
          right.params[index],
          isInFunctionReturn,
        ),
      );
    }
  }
  for (let index = right.params.length; index < left.params.length; ++index) {
    if (left.params[index].optional !== true) {
      finalResult.push(
        removedRequiredParamError(left.params[index].typeAnnotation, right),
      );
    }
  }
  return finalResult;
}

function addedRequiredParamError(
  oldType: FunctionTypeAnnotation,
  newType: AnyTypeAnnotation,
): ComparisonResult {
  const addedType = getSimplifiedType(newType);
  return {
    message: `Error: cannot add new required parameter ${addedType} because native will not provide it.`,
    oldTypeLoc: oldType.loc,
    newTypeLoc: newType.loc,
  };
}

function removedRequiredParamError(
  oldType: AnyTypeAnnotation,
  newType: FunctionTypeAnnotation,
) {
  const removedType = getSimplifiedType(oldType);
  return {
    message: `Error: cannot remove required parameter ${removedType} because native code will break when js calls it.`,
    oldTypeLoc: oldType.loc,
    newTypeLoc: newType.loc,
  };
}

function optionalError(
  left: FunctionTypeParam | ObjectTypeProperty,
  right: FunctionTypeParam | ObjectTypeProperty,
  isInFunctionReturn: boolean,
): ComparisonResult {
  const newAnnotationType = isInFunctionReturn ? left : right;
  const oldAnnotationType = isInFunctionReturn ? right : left;
  const newOptionality =
    newAnnotationType.optional === true ? 'optional' : 'required';
  const oldOptionality =
    oldAnnotationType.optional === true ? 'optional' : 'required';
  const newType = getSimplifiedType(newAnnotationType.typeAnnotation);
  const oldType = getSimplifiedType(oldAnnotationType.typeAnnotation);
  const reason = isInFunctionReturn
    ? 'is incompatible with what the native code returns'
    : 'native code will break when js calls it';
  return {
    message: `Error: cannot change ${oldOptionality} ${oldType} to ${newOptionality} ${newType} because ${reason}.`,
    newTypeLoc: newAnnotationType.loc,
    oldTypeLoc: oldAnnotationType.loc,
  };
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
