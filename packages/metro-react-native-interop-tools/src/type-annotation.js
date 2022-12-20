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

import type {SourceLocation} from '@babel/types';

export type AnyType = $ReadOnly<{
  type: 'AnyTypeAnnotation',
  loc: ?SourceLocation,
}>;

export type BooleanTypeAnnotation = $ReadOnly<{
  type: 'BooleanTypeAnnotation',
  loc: ?SourceLocation,
}>;

export type NumberTypeAnnotation = $ReadOnly<{
  type: 'NumberTypeAnnotation',
  loc: ?SourceLocation,
}>;

export type StringTypeAnnotation = $ReadOnly<{
  type: 'StringTypeAnnotation',
  loc: ?SourceLocation,
}>;

export type VoidTypeAnnotation = $ReadOnly<{
  type: 'VoidTypeAnnotation',
  loc: ?SourceLocation,
}>;

export type FunctionTypeParam = $ReadOnly<{|
  loc: ?SourceLocation,
  name: ?string,
  optional: ?boolean,
  typeAnnotation: AnyTypeAnnotation,
|}>;

export type ObjectTypeProperty = $ReadOnly<{
  loc: ?SourceLocation,
  name: string,
  optional: boolean,
  typeAnnotation: AnyTypeAnnotation,
}>;

export type InterfaceExtends = $ReadOnly<{
  loc: ?BabelNodeSourceLocation,
  name: string,
  typeParameters: $ReadOnlyArray<AnyTypeAnnotation>,
}>;

export type NullableTypeAnnotation = $ReadOnly<{
  type: 'NullableTypeAnnotation',
  loc: ?SourceLocation,
  typeAnnotation: AnyTypeAnnotation,
}>;

export type FunctionTypeAnnotation = $ReadOnly<{
  type: 'FunctionTypeAnnotation',
  loc: ?SourceLocation,
  params: $ReadOnlyArray<FunctionTypeParam>,
  returnTypeAnnotation: AnyTypeAnnotation,
}>;

export type ObjectTypeAnnotation = $ReadOnly<{
  type: 'ObjectTypeAnnotation',
  loc: ?SourceLocation,
  properties: $ReadOnlyArray<ObjectTypeProperty>,
}>;

export type TupleTypeAnnotation = $ReadOnly<{
  type: 'TupleTypeAnnotation',
  loc: ?SourceLocation,
  types: $ReadOnlyArray<AnyTypeAnnotation>,
}>;

export type GenericTypeAnnotation = $ReadOnly<{
  type: 'GenericTypeAnnotation',
  loc: ?SourceLocation,
  name: string,
  typeParameters: $ReadOnlyArray<AnyTypeAnnotation>,
}>;

export type UnionTypeAnnotation = $ReadOnly<{
  type: 'UnionTypeAnnotation',
  loc: ?SourceLocation,
  types: $ReadOnlyArray<AnyTypeAnnotation>,
}>;

export type IntersectionTypeAnnotation = $ReadOnly<{
  type: 'IntersectionTypeAnnotation',
  loc: ?SourceLocation,
  types: $ReadOnlyArray<AnyTypeAnnotation>,
}>;

export type ArrayTypeAnnotation = $ReadOnly<{
  type: 'ArrayTypeAnnotation',
  loc: ?SourceLocation,
  elementType: AnyTypeAnnotation,
}>;

export type StringLiteralTypeAnnotation = $ReadOnly<{
  type: 'StringLiteralTypeAnnotation',
  loc: ?SourceLocation,
  value: string,
}>;

export type NumberLiteralTypeAnnotation = $ReadOnly<{
  type: 'NumberLiteralTypeAnnotation',
  loc: ?SourceLocation,
  value: number,
}>;

export type BooleanLiteralTypeAnnotation = $ReadOnly<{
  type: 'BooleanLiteralTypeAnnotation',
  loc: ?SourceLocation,
  value: boolean,
}>;

export type NullLiteralTypeAnnotation = $ReadOnly<{
  type: 'NullLiteralTypeAnnotation',
  loc: ?SourceLocation,
}>;

export type LiteralTypeAnnotation =
  | StringLiteralTypeAnnotation
  | NumberLiteralTypeAnnotation
  | BooleanLiteralTypeAnnotation;

export type AnyTypeAnnotation =
  | BooleanTypeAnnotation
  | NumberTypeAnnotation
  | StringTypeAnnotation
  | VoidTypeAnnotation
  | AnyType
  | NullableTypeAnnotation
  | FunctionTypeAnnotation
  | ObjectTypeAnnotation
  | TupleTypeAnnotation
  | GenericTypeAnnotation
  | UnionTypeAnnotation
  | IntersectionTypeAnnotation
  | ArrayTypeAnnotation
  | StringLiteralTypeAnnotation
  | NumberLiteralTypeAnnotation
  | BooleanLiteralTypeAnnotation
  | NullLiteralTypeAnnotation;
