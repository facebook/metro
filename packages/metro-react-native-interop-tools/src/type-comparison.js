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

import type {
  VoidTypeAnnotation,
  UnionTypeAnnotation,
  TupleTypeAnnotation,
  StringTypeAnnotation,
  StringLiteralTypeAnnotation,
  NumberTypeAnnotation,
  NumberLiteralTypeAnnotation,
  NullLiteralTypeAnnotation,
  IntersectionTypeAnnotation,
  GenericTypeAnnotation,
  BooleanTypeAnnotation,
  BooleanLiteralTypeAnnotation,
  ArrayTypeAnnotation,
  AnyType,
} from './type-annotation';
import type {
  AnyTypeAnnotation,
  NullableTypeAnnotation,
  LiteralTypeAnnotation,
  FunctionTypeAnnotation,
  FunctionTypeParam,
  ObjectTypeProperty,
  ObjectTypeAnnotation,
} from './type-annotation.js';
import type {SourceLocation} from '@babel/types';

import nullthrows from 'nullthrows';

type ComparisonResult = $ReadOnly<{
  message: string,
  newTypeLoc: ?SourceLocation,
  oldTypeLoc: ?SourceLocation,
}>;

function removeNullable(
  annotation: NullableTypeAnnotation,
):
  | AnyType
  | BooleanTypeAnnotation
  | NumberTypeAnnotation
  | StringTypeAnnotation
  | VoidTypeAnnotation
  | TupleTypeAnnotation
  | GenericTypeAnnotation
  | UnionTypeAnnotation
  | IntersectionTypeAnnotation
  | ArrayTypeAnnotation
  | StringLiteralTypeAnnotation
  | NumberLiteralTypeAnnotation
  | BooleanLiteralTypeAnnotation
  | NullLiteralTypeAnnotation
  | FunctionTypeAnnotation
  | ObjectTypeAnnotation {
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
    case 'ObjectTypeAnnotation':
      return 'object';
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
        return [
          literalError(
            left,
            // $FlowFixMe[incompatible-cast]
            (right: LiteralTypeAnnotation),
            isInFunctionReturn,
          ),
        ];
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
    case 'ObjectTypeAnnotation':
      if (right.type === 'ObjectTypeAnnotation') {
        return compareObjectType(left, right, isInFunctionReturn);
      }
      return [basicError(left, right, isInFunctionReturn)];
    default:
      throw new Error(left.type + 'is not supported');
  }
}

function unsafeMadeOptional(
  leftOptional: boolean,
  rightOptional: boolean,
  isInFunctionReturn: boolean,
): boolean {
  /*
   * For object properties in an object that's part of function return
   * statement we can't change from optional to required because the
   * native code might still return a nullable value where js no longer expects it.
   * For function parameters or object properties that are not
   * in the function return we can't change from required to optional because
   * native code still requires this parameter as part of its function signature.
   */
  return (
    (leftOptional === false && rightOptional === true && !isInFunctionReturn) ||
    (leftOptional === true && rightOptional === false && isInFunctionReturn)
  );
}

function compareObjectType(
  left: ObjectTypeAnnotation,
  right: ObjectTypeAnnotation,
  isInFunctionReturn: boolean,
): Array<ComparisonResult> {
  const leftProps = new Map<string, ObjectTypeProperty>();
  const rightProps = new Map<string, ObjectTypeProperty>();
  const finalResult = [];
  left.properties.forEach(prop => {
    leftProps.set(prop.name, prop);
  });
  right.properties.forEach(prop => {
    rightProps.set(prop.name, prop);
  });

  for (const key of leftProps.keys()) {
    const leftType = nullthrows(leftProps.get(key));
    const rightType = rightProps.get(key);
    if (rightType != null) {
      const leftOptional = leftType.optional;
      const rightOptional = rightType.optional;
      const comparisonResult = compareTypeAnnotation(
        leftType.typeAnnotation,
        rightType.typeAnnotation,
        isInFunctionReturn,
      );
      if (comparisonResult.length > 0) {
        finalResult.push(...comparisonResult);
      }
      if (unsafeMadeOptional(leftOptional, rightOptional, isInFunctionReturn)) {
        finalResult.push(
          optionalError(leftType, rightType, isInFunctionReturn),
        );
      }
    } else if (leftType.optional === false) {
      finalResult.push(
        differentPropertiesError(
          leftType.typeAnnotation,
          right,
          isInFunctionReturn,
        ),
      );
    }
  }
  for (const key of rightProps.keys()) {
    const leftType = leftProps.get(key);
    const rightType = nullthrows(rightProps.get(key));
    if (leftType == null && rightType.optional === false) {
      finalResult.push(
        differentPropertiesError(
          left,
          rightType.typeAnnotation,
          isInFunctionReturn,
        ),
      );
    }
  }
  return finalResult;
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

function differentPropertiesError(
  left: AnyTypeAnnotation,
  right: AnyTypeAnnotation,
  isInFunctionReturn: boolean,
): ComparisonResult {
  const newAnnotationType = isInFunctionReturn ? left : right;
  const oldAnnotationType = isInFunctionReturn ? right : left;
  const newType = getSimplifiedType(newAnnotationType);
  const oldType = getSimplifiedType(oldAnnotationType);
  let message = '';
  const reason = isInFunctionReturn
    ? 'it is incompatible with what the native code returns'
    : 'native code will break when js calls it';
  if (newAnnotationType.type === 'ObjectTypeAnnotation') {
    message = `Error: cannot remove ${oldType} from object properties because ${reason}.`;
  } else {
    message = `Error: cannot add ${newType} to object properties because ${reason}.`;
  }
  return {
    message,
    newTypeLoc: newAnnotationType.loc,
    oldTypeLoc: oldAnnotationType.loc,
  };
}
