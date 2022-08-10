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

import * as t from '@babel/types';
import {isTurboModule, getTypeAnnotation} from '../ast-helpers.js';

test('isTurboModule returns true, name is "TurboModule" and typeParams is null', () => {
  expect(
    isTurboModule(t.interfaceExtends(t.identifier('TurboModule'))),
  ).toEqual(true);
});

test('isTurboModule returns false, name is not "TurboModule"', () => {
  expect(
    isTurboModule(t.interfaceExtends(t.identifier('OtherModule'))),
  ).toEqual(false);
});

test('isTurboModule returns false, typeParameters it is not empty', () => {
  expect(
    isTurboModule(
      t.interfaceExtends(
        t.identifier('TurboModule'),
        t.typeParameterInstantiation([t.anyTypeAnnotation()]),
      ),
    ),
  ).toEqual(false);
});

test('getTypeAnnotation testing BooleanTypeAnnotation', () => {
  expect(getTypeAnnotation(t.booleanTypeAnnotation()).type).toBe(
    t.booleanTypeAnnotation().type,
  );
});

test('getTypeAnnotation testing NumberTypeAnnotation', () => {
  expect(getTypeAnnotation(t.numberTypeAnnotation()).type).toBe(
    t.numberTypeAnnotation().type,
  );
});

test('getTypeAnnotation testing StringTypeAnnotation', () => {
  expect(getTypeAnnotation(t.stringTypeAnnotation()).type).toBe(
    t.stringTypeAnnotation().type,
  );
});

test('getTypeAnnotation testing VoidTypeAnnotation', () => {
  expect(getTypeAnnotation(t.voidTypeAnnotation()).type).toBe(
    t.voidTypeAnnotation().type,
  );
});

test('getTypeAnnotation testing UnknownTypeAnnotation', () => {
  expect(getTypeAnnotation(t.booleanLiteralTypeAnnotation(true)).type).toBe(
    'UnknownTypeAnnotation',
  );
});

test('getTypeAnnotation testing NullableTypeAnnotation', () => {
  expect(
    getTypeAnnotation(t.nullableTypeAnnotation(t.anyTypeAnnotation())),
  ).toEqual({
    type: 'NullableTypeAnnotation',
    loc: null,
    typeAnnotation: {
      type: 'AnyTypeAnnotation',
      loc: null,
    },
  });
});
