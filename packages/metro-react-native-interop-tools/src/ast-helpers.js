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
  FunctionTypeAnnotation as BabelNodeFunctionTypeAnnotation,
  FunctionTypeParam as BabelNodeFunctionTypeParam,
  ObjectTypeAnnotation as BabelNodeObjectTypeAnnotation,
  ObjectTypeProperty as BabelNodeObjectTypeProperty,
  ObjectTypeSpreadProperty as BabelNodeObjectTypeSpreadProperty,
  TupleTypeAnnotation as BabelNodeTupleTypeAnnotation,
  NullableTypeAnnotation as BabelNodeNullableTypeAnnotation,
  GenericTypeAnnotation as BabelNodeGenericTypeAnnotation,
  UnionTypeAnnotation as BabelNodeUnionTypeAnnotation,
  IntersectionTypeAnnotation as BabelNodeIntersectionTypeAnnotation,
  ArrayTypeAnnotation as BabelNodeArrayTypeAnnotation,
  InterfaceExtends as BabelNodeInterfaceExtends,
  StringLiteralTypeAnnotation as BabelNodeStringLiteralTypeAnnotation,
  NumberLiteralTypeAnnotation as BabelNodeNumberLiteralTypeAnnotation,
} from '@babel/types';

import type {
  AnyTypeAnnotation,
  ArrayTypeAnnotation,
  NullableTypeAnnotation,
  FunctionTypeAnnotation,
  ObjectTypeAnnotation,
  FunctionTypeParam,
  ObjectTypeProperty,
  TupleTypeAnnotation,
  GenericTypeAnnotation,
  UnionTypeAnnotation,
  IntersectionTypeAnnotation,
  StringLiteralTypeAnnotation,
  NumberLiteralTypeAnnotation,
} from './type-annotation.js';

export type Schema = {
  typegenSchema: {},
  ...
};

export function isTurboModule(i: BabelNodeInterfaceExtends): boolean {
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

    case 'NumberLiteralTypeAnnotation':
      return getNumberLiteralTypeAnnotation(typeNode);

    case 'StringLiteralTypeAnnotation':
      return getStringLiteralTypeAnnotation(typeNode);

    case 'ArrayTypeAnnotation':
      return getArrayTypeAnnotation(typeNode);

    case 'NullableTypeAnnotation':
      return getNullableTypeAnnotation(typeNode);

    case 'FunctionTypeAnnotation':
      return getFunctionTypeAnnotation(typeNode);

    case 'ObjectTypeAnnotation':
      return getObjectTypeAnnotation(typeNode);

    case 'TupleTypeAnnotation':
      return getTupleTypeAnnotation(typeNode);

    case 'GenericTypeAnnotation':
      return getGenericTypeAnnotation(typeNode);

    case 'UnionTypeAnnotation':
      return getUnionTypeAnnotation(typeNode);

    case 'IntersectionTypeAnnotation':
      return getIntersectionTypeAnnotation(typeNode);

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

//TODO T127639272 add support for spread properties
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

export function getTupleTypeAnnotation(
  typeNode: BabelNodeTupleTypeAnnotation,
): TupleTypeAnnotation {
  return {
    type: 'TupleTypeAnnotation',
    loc: getNodeLoc(typeNode.loc),
    types: typeNode.types.map(getTypeAnnotation),
  };
}

export function getNullableTypeAnnotation(
  typeNode: BabelNodeNullableTypeAnnotation,
): NullableTypeAnnotation {
  return {
    type: typeNode.type,
    loc: getNodeLoc(typeNode.loc),
    typeAnnotation: getTypeAnnotation(typeNode.typeAnnotation),
  };
}

export function getNameFromGenericNode(
  node: BabelNodeIdentifier | BabelNodeQualifiedTypeIdentifier,
): string {
  if (node.type === 'Identifier') {
    return node.name;
  }
  return node.id.name;
}

export function getGenericTypeAnnotation(
  typeNode: BabelNodeGenericTypeAnnotation,
): GenericTypeAnnotation {
  return {
    type: typeNode.type,
    loc: getNodeLoc(typeNode.loc),
    name: getNameFromGenericNode(typeNode.id),
    typeParameters: typeNode.typeParameters?.params
      ? typeNode.typeParameters.params?.map(getTypeAnnotation)
      : [],
  };
}

export function getUnionTypeAnnotation(
  typeNode: BabelNodeUnionTypeAnnotation,
): UnionTypeAnnotation {
  return {
    type: typeNode.type,
    loc: getNodeLoc(typeNode.loc),
    types: typeNode.types.map(getTypeAnnotation),
  };
}

export function getIntersectionTypeAnnotation(
  typeNode: BabelNodeIntersectionTypeAnnotation,
): IntersectionTypeAnnotation {
  return {
    type: typeNode.type,
    loc: getNodeLoc(typeNode.loc),
    types: typeNode.types.map(getTypeAnnotation),
  };
}

export function getArrayTypeAnnotation(
  typeNode: BabelNodeArrayTypeAnnotation,
): ArrayTypeAnnotation {
  return {
    type: typeNode.type,
    loc: getNodeLoc(typeNode.loc),
    elementType: getTypeAnnotation(typeNode.elementType),
  };
}

export function getStringLiteralTypeAnnotation(
  typeNode: BabelNodeStringLiteralTypeAnnotation,
): StringLiteralTypeAnnotation {
  return {
    type: typeNode.type,
    loc: getNodeLoc(typeNode.loc),
    value: typeNode.value,
  };
}

export function getNumberLiteralTypeAnnotation(
  typeNode: BabelNodeNumberLiteralTypeAnnotation,
): NumberLiteralTypeAnnotation {
  return {
    type: typeNode.type,
    loc: getNodeLoc(typeNode.loc),
    value: typeNode.value,
  };
}
