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
  File as BabelNodeFile,
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
  InterfaceDeclaration as BabelNodeInterfaceDeclaration,
  FlowType as BabelNodeFlowType,
  Statement as BabelNodeStatement,
} from '@babel/types';

import type {
  AnyType,
  NumberTypeAnnotation,
  StringTypeAnnotation,
  VoidTypeAnnotation,
  BooleanTypeAnnotation,
  InterfaceExtends,
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
  BooleanLiteralTypeAnnotation,
  NullLiteralTypeAnnotation,
} from './type-annotation.js';

export type BoundarySchema = {
  typegenSchema: {},
  source: string,
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
      return ({
        type: typeNode.type,
        loc: getNodeLoc(typeNode.loc),
      }: BooleanTypeAnnotation);

    case 'NumberTypeAnnotation':
      return ({
        type: typeNode.type,
        loc: getNodeLoc(typeNode.loc),
      }: NumberTypeAnnotation);

    case 'StringTypeAnnotation':
      return ({
        type: typeNode.type,
        loc: getNodeLoc(typeNode.loc),
      }: StringTypeAnnotation);

    case 'VoidTypeAnnotation':
      return ({
        type: typeNode.type,
        loc: getNodeLoc(typeNode.loc),
      }: VoidTypeAnnotation);

    case 'AnyTypeAnnotation':
      return ({
        type: typeNode.type,
        loc: getNodeLoc(typeNode.loc),
      }: AnyType);

    case 'NullLiteralTypeAnnotation':
      return ({
        type: typeNode.type,
        loc: getNodeLoc(typeNode.loc),
      }: NullLiteralTypeAnnotation);

    case 'BooleanLiteralTypeAnnotation':
      return getBooleanLiteralTypeAnnotation(typeNode);

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
      throw new Error(typeNode.type + ' not supported');
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
    loc: getNodeLoc(param.loc),
    name: param.name?.name,
    optional: param.optional,
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
      type: 'AnyTypeAnnotation',
      loc: null,
    },
  };
}

export function getObjectTypeProperty(
  typeProperty: BabelNodeObjectTypeProperty,
): ObjectTypeProperty {
  return {
    loc: getNodeLoc(typeProperty.loc),
    name: getNameFromID(typeProperty.key),
    optional: typeProperty.optional,
    typeAnnotation: getTypeAnnotation(typeProperty.value),
  };
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

// Flow can check for exhaustive switch cases where eslint can not, using flow to cover all possible cases is better than having default fallbacks.
// eslint-disable-next-line consistent-return
export function getNameFromID(
  node:
    | BabelNodeIdentifier
    | BabelNodeQualifiedTypeIdentifier
    | BabelNodeStringLiteral,
): string {
  switch (node.type) {
    case 'QualifiedTypeIdentifier':
      return node.id.name;
    case 'StringLiteral':
      return node.value;
    case 'Identifier':
      return node.name;
  }
}

export function getGenericTypeAnnotation(
  typeNode: BabelNodeGenericTypeAnnotation,
): GenericTypeAnnotation {
  return {
    type: typeNode.type,
    loc: getNodeLoc(typeNode.loc),
    name: getNameFromID(typeNode.id),
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

export function getBooleanLiteralTypeAnnotation(
  typeNode: BabelNodeBooleanLiteralTypeAnnotation,
): BooleanLiteralTypeAnnotation {
  return {
    type: typeNode.type,
    loc: getNodeLoc(typeNode.loc),
    value: typeNode.value,
  };
}

export function getInterfaceExtends(
  interfaceNode: BabelNodeInterfaceExtends,
): InterfaceExtends {
  return {
    loc: getNodeLoc(interfaceNode.loc),
    name: getNameFromID(interfaceNode.id),
    typeParameters: getTypeParameters(interfaceNode.typeParameters?.params),
  };
}

function interfaceDeclarationReducer(
  interfaceDeclaration: ?BabelNodeInterfaceDeclaration,
  bodyNode: BabelNodeStatement,
): ?BabelNodeInterfaceDeclaration {
  if (
    bodyNode.type === 'ExportNamedDeclaration' &&
    bodyNode.declaration != null
  ) {
    return interfaceDeclarationReducer(
      interfaceDeclaration,
      bodyNode.declaration,
    );
  } else if (
    bodyNode.type === 'InterfaceDeclaration' &&
    bodyNode.extends?.some(isTurboModule)
  ) {
    return bodyNode;
  }
  return interfaceDeclaration;
}

export function getTypeParameters(
  params: ?Array<BabelNodeFlowType>,
): Array<AnyTypeAnnotation> {
  return params?.map(getTypeAnnotation) ?? [];
}

export function getBoundarySchemaFromAST(
  ast: BabelNodeFile,
  source: string,
): BoundarySchema {
  const schema: BoundarySchema = {
    typegenSchema: {},
    source,
  };
  const interfaceNode: ?BabelNodeInterfaceDeclaration = ast.program.body.reduce(
    interfaceDeclarationReducer,
    null,
  );
  if (interfaceNode != null) {
    // $FlowFixMe[prop-missing]
    schema.typegenSchema[interfaceNode.id.name] = {
      typeAnnotation: {
        type: 'InterfaceDeclarationTypeAnnotation',
        innerType: getTypeAnnotation(interfaceNode.body),
        extends: interfaceNode.extends?.map(getInterfaceExtends),
      },
    };
  }
  return schema;
}
