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

import type {InterfaceExtends} from '@babel/types';

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

export type AnyTypeAnnotation = BasicTypeAnnotation | NullableTypeAnnotation;

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
    default:
      return {type: 'UnknownTypeAnnotation', loc: null};
  }
}
