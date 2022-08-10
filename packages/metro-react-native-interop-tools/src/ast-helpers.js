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

import type {
  InterfaceExtends,
  FunctionTypeAnnotation as BabelNodeFunctionTypeAnnotation,
  FunctionTypeParam as BabelNodeFunctionTypeParam,
  ObjectTypeAnnotation as BabelNodeObjectTypeAnnotation,
  ObjectTypeProperty as BabelNodeObjectTypeProperty,
  ObjectTypeSpreadProperty as BabelNodeObjectTypeSpreadProperty,
} from '@babel/types';

export type FunctionTypeParam = {|
  name: ?string,
  typeAnnotation: AnyTypeAnnotation,
|};

export type BasicTypeAnnotation = $ReadOnly<{
  type:
    | 'BooleanTypeAnnotation'
    | 'NumberTypeAnnotation'
    | 'StringTypeAnnotation'
    | 'VoidTypeAnnotation'
    | 'UnknownTypeAnnotation'
    | 'AnyTypeAnnotation',
  loc: ?BabelNodeSourceLocation,
}>;

export type NullableTypeAnnotation = $ReadOnly<{
  type: 'NullableTypeAnnotation',
  loc: ?BabelNodeSourceLocation,
  typeAnnotation: AnyTypeAnnotation,
}>;

export type FunctionTypeAnnotation = $ReadOnly<{
  type: 'FunctionTypeAnnotation',
  loc: ?BabelSourceLocation,
  params: $ReadOnlyArray<FunctionTypeParam>,
  returnTypeAnnotation: AnyTypeAnnotation,
}>;

export type ObjectTypeProperty = $ReadOnly<{
  loc: ?BabelSourceLocation,
  name: string,
  optional: boolean,
  typeAnnotation: AnyTypeAnnotation,
}>;

export type ObjectTypeAnnotation = $ReadOnly<{
  type: 'ObjectTypeAnnotation',
  loc: ?BabelSourceLocation,
  properties: $ReadOnlyArray<ObjectTypeProperty>,
}>;

export type AnyTypeAnnotation =
  | BasicTypeAnnotation
  | NullableTypeAnnotation
  | FunctionTypeAnnotation
  | ObjectTypeAnnotation;

export function isTurboModule(i: InterfaceExtends): boolean {
  return (
    i.id.name === 'TurboModule' &&
    (i.typeParameters == null || i.typeParameters.params.length === 0)
  );
}

export function getNodeLoc(
  loc: ?BabelNodeSourceLocation,
): ?BabelNodeSourceLocation {
  return loc == null
    ? null
    : {
        start: loc.start,
        end: loc.end,
      };
}

export function getTypeAnnotation(typeNode: BabelNodeFlow): AnyTypeAnnotation {
  switch (typeNode.type) {
    case 'BooleanTypeAnnotation':
    case 'NumberTypeAnnotation':
    case 'StringTypeAnnotation':
    case 'VoidTypeAnnotation':
    case 'AnyTypeAnnotation':
      return {
        type: typeNode.type,
        loc: getNodeLoc(typeNode.loc),
      };

    case 'NullableTypeAnnotation':
      return {
        type: typeNode.type,
        loc: getNodeLoc(typeNode.loc),
        typeAnnotation: getTypeAnnotation(typeNode.typeAnnotation),
      };
    case 'FunctionTypeAnnotation':
      return getFunctionTypeAnnotation(typeNode);

    case 'ObjectTypeAnnotation':
      return getObjectTypeAnnotation(typeNode);

    default:
      return {type: 'UnknownTypeAnnotation', loc: null};
  }
}

export function getFunctionTypeAnnotation(
  typeNode: BabelNodeFunctionTypeAnnotation,
): FunctionTypeAnnotation {
  return {
    type: 'FunctionTypeAnnotation',
    loc: getNodeLoc(typeNode.loc),
    params: typeNode.params.map(getFunctionTypeParameter),
    returnTypeAnnotation: getTypeAnnotation(typeNode.returnType),
  };
}

export function getFunctionTypeParameter(
  param: BabelNodeFunctionTypeParam,
): FunctionTypeParam {
  return {
    name: param.name?.name,
    typeAnnotation: getTypeAnnotation(param.typeAnnotation),
  };
}

export function getObjectTypeAnnotation(
  typeNode: BabelNodeObjectTypeAnnotation,
): ObjectTypeAnnotation {
  return {
    type: typeNode.type,
    loc: getNodeLoc(typeNode.loc),
    properties: typeNode.properties.map(
      (
        property:
          | BabelNodeObjectTypeProperty
          | BabelNodeObjectTypeSpreadProperty,
      ) => {
        return property.type === 'ObjectTypeProperty'
          ? getObjectTypeProperty(property)
          : getObjectTypeSpreadProperty(property);
      },
    ),
  };
}

//TODO:T127639272 add support for spread properties
export function getObjectTypeSpreadProperty(
  typeProperty: BabelNodeObjectTypeSpreadProperty,
): ObjectTypeProperty {
  return {
    loc: getNodeLoc(typeProperty.loc),
    name: '',
    optional: false,
    typeAnnotation: {
      type: 'UnknownTypeAnnotation',
      loc: null,
    },
  };
}

export function getObjectTypeProperty(
  typeProperty: BabelNodeObjectTypeProperty,
): ObjectTypeProperty {
  return {
    loc: getNodeLoc(typeProperty.loc),
    name: getNameFromTypeProperty(typeProperty.key),
    optional: typeProperty.optional,
    typeAnnotation: getTypeAnnotation(typeProperty.value),
  };
}

export function getNameFromTypeProperty(
  node: BabelNodeIdentifier | BabelNodeStringLiteral,
): string {
  if (node.type === 'StringLiteral') {
    return node.value;
  }
  return node.name;
}
