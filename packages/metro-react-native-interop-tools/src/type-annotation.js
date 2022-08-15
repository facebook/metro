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

export type FunctionTypeParam = $ReadOnly<{|
  name: ?string,
  typeAnnotation: AnyTypeAnnotation,
|}>;

export type ObjectTypeProperty = $ReadOnly<{
  loc: ?BabelSourceLocation,
  name: string,
  optional: boolean,
  typeAnnotation: AnyTypeAnnotation,
}>;

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

export type InterfaceExtends = $ReadOnly<{
  loc: ?BabelNodeSourceLocation,
  name: string,
  typeParameters: $ReadOnlyArray<AnyTypeAnnotation>,
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

export type ObjectTypeAnnotation = $ReadOnly<{
  type: 'ObjectTypeAnnotation',
  loc: ?BabelSourceLocation,
  properties: $ReadOnlyArray<ObjectTypeProperty>,
}>;

export type TupleTypeAnnotation = $ReadOnly<{
  type: 'TupleTypeAnnotation',
  loc: ?BabelSourceLocation,
  types: $ReadOnlyArray<AnyTypeAnnotation>,
}>;

export type GenericTypeAnnotation = $ReadOnly<{
  type: 'GenericTypeAnnotation',
  loc: ?BabelSourceLocation,
  name: string,
  typeParameters: $ReadOnlyArray<AnyTypeAnnotation>,
}>;

export type UnionTypeAnnotation = $ReadOnly<{
  type: 'UnionTypeAnnotation',
  loc: ?BabelSourceLocation,
  types: $ReadOnlyArray<AnyTypeAnnotation>,
}>;

export type IntersectionTypeAnnotation = $ReadOnly<{
  type: 'IntersectionTypeAnnotation',
  loc: ?BabelSourceLocation,
  types: $ReadOnlyArray<AnyTypeAnnotation>,
}>;

export type ArrayTypeAnnotation = $ReadOnly<{
  type: 'ArrayTypeAnnotation',
  loc: ?BabelSourceLocation,
  elementType: AnyTypeAnnotation,
}>;

export type StringLiteralTypeAnnotation = $ReadOnly<{
  type: 'StringLiteralTypeAnnotation',
  loc: ?BabelSourceLocation,
  value: string,
}>;

export type NumberLiteralTypeAnnotation = $ReadOnly<{
  type: 'NumberLiteralTypeAnnotation',
  loc: ?BabelSourceLocation,
  value: number,
}>;

export type AnyTypeAnnotation =
  | BasicTypeAnnotation
  | NullableTypeAnnotation
  | FunctionTypeAnnotation
  | ObjectTypeAnnotation
  | TupleTypeAnnotation
  | GenericTypeAnnotation
  | UnionTypeAnnotation
  | IntersectionTypeAnnotation
  | ArrayTypeAnnotation
  | StringLiteralTypeAnnotation
  | NumberLiteralTypeAnnotation;
