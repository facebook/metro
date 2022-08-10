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
import {
  isTurboModule,
  getTypeAnnotation,
  getFunctionTypeParameter,
  getFunctionTypeAnnotation,
  getNameFromTypeProperty,
  getObjectTypeAnnotation,
  getObjectTypeProperty,
  getObjectTypeSpreadProperty,
  getGenericTypeAnnotation,
  getTupleTypeAnnotation,
  getUnionTypeAnnotation,
  getIntersectionTypeAnnotation,
  getArrayTypeAnnotation,
  getNameFromGenericNode,
  getStringLiteralTypeAnnotation,
  getNumberLiteralTypeAnnotation,
} from '../ast-helpers.js';

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

test('getTypeAnnotation, testing BooleanTypeAnnotation', () => {
  expect(getTypeAnnotation(t.booleanTypeAnnotation()).type).toBe(
    t.booleanTypeAnnotation().type,
  );
});

test('getTypeAnnotation, testing NumberTypeAnnotation', () => {
  expect(getTypeAnnotation(t.numberTypeAnnotation()).type).toBe(
    t.numberTypeAnnotation().type,
  );
});

test('getTypeAnnotation, testing StringTypeAnnotation', () => {
  expect(getTypeAnnotation(t.stringTypeAnnotation()).type).toBe(
    t.stringTypeAnnotation().type,
  );
});

test('getTypeAnnotation, testing VoidTypeAnnotation', () => {
  expect(getTypeAnnotation(t.voidTypeAnnotation()).type).toBe(
    t.voidTypeAnnotation().type,
  );
});

test('getTypeAnnotation, testing UnknownTypeAnnotation', () => {
  expect(getTypeAnnotation(t.booleanLiteralTypeAnnotation(true)).type).toBe(
    'UnknownTypeAnnotation',
  );
});

test('getTypeAnnotation, testing NullableTypeAnnotation', () => {
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

test('getFunctionTypeAnnotation, function has a function as parameter', () => {
  const callback: BabelNodeFunctionTypeAnnotation = t.functionTypeAnnotation(
    undefined,
    [],
    undefined,
    t.voidTypeAnnotation(),
  );
  const functionNode: BabelNodeFunctionTypeAnnotation =
    t.functionTypeAnnotation(
      undefined,
      [
        t.functionTypeParam(
          t.identifier('screenShoudBeKeptOn'),
          t.anyTypeAnnotation(),
        ),
        t.functionTypeParam(t.identifier('callback'), callback),
      ],
      undefined,
      t.anyTypeAnnotation(),
    );
  expect(getFunctionTypeAnnotation(functionNode)).toEqual({
    type: 'FunctionTypeAnnotation',
    loc: null,
    params: [
      {
        name: 'screenShoudBeKeptOn',
        typeAnnotation: {
          type: 'AnyTypeAnnotation',
          loc: null,
        },
      },
      {
        name: 'callback',
        typeAnnotation: {
          type: 'FunctionTypeAnnotation',
          loc: null,
          params: [],
          returnTypeAnnotation: {
            type: 'VoidTypeAnnotation',
            loc: null,
          },
        },
      },
    ],
    returnTypeAnnotation: {
      type: 'AnyTypeAnnotation',
      loc: null,
    },
  });
});

test('getFunctionTypeParameter, testig basic type parameter', () => {
  const param: BabelNodeFunctionTypeParam = t.functionTypeParam(
    t.identifier('testParam'),
    t.anyTypeAnnotation(),
  );
  expect(getFunctionTypeParameter(param)).toEqual({
    name: 'testParam',
    typeAnnotation: {
      type: 'AnyTypeAnnotation',
      loc: null,
    },
  });
});

test('getObjectTypeAnnotation, testing an object with a AnyTypeAnnotation property', () => {
  const property: BabelNodeObjectTypeProperty = t.objectTypeProperty(
    t.identifier('setKeepScreenOn'),
    t.anyTypeAnnotation(),
    t.variance('minus'),
  );
  const objectNode: BabelNodeObjectTypeAnnotation = t.objectTypeAnnotation(
    [property],
    [],
    [],
    [],
    false,
  );
  expect(getObjectTypeAnnotation(objectNode)).toEqual({
    type: 'ObjectTypeAnnotation',
    loc: null,
    properties: [
      {
        loc: null,
        name: 'setKeepScreenOn',
        optional: undefined,
        typeAnnotation: {
          type: 'AnyTypeAnnotation',
          loc: null,
        },
      },
    ],
  });
});

test('getObjectTypeProperty, testing AnyTypeAnnotation property', () => {
  const property: BabelNodeObjectTypeProperty = t.objectTypeProperty(
    t.identifier('testProp'),
    t.anyTypeAnnotation(),
    t.variance('plus'),
  );
  expect(getObjectTypeProperty(property)).toEqual({
    loc: null,
    name: 'testProp',
    optional: undefined,
    typeAnnotation: {
      type: 'AnyTypeAnnotation',
      loc: null,
    },
  });
});

test('getObjectTypeSpreadProperty returns unknown type', () => {
  const spreadProperty: BabelNodeObjectTypeSpreadProperty =
    t.objectTypeSpreadProperty(t.anyTypeAnnotation());
  expect(getObjectTypeSpreadProperty(spreadProperty)).toEqual({
    loc: null,
    name: '',
    optional: false,
    typeAnnotation: {
      loc: null,
      type: 'UnknownTypeAnnotation',
    },
  });
});

test('getNameFromTypeProperty, testing BabelNodeIdentifier', () => {
  const node: BabelNodeIdentifier = t.identifier('test');
  expect(getNameFromTypeProperty(node)).toBe('test');
});

test('getNameFromTypeProperty, testing BabelNodeStringLiteral', () => {
  const node: BabelNodeStringLiteral = t.stringLiteral('test');
  expect(getNameFromTypeProperty(node)).toBe('test');
});

test('getTupleTypeAnnotation, testing basic tuple', () => {
  const typeNode: BabelNodeTupleTypeAnnotation = t.tupleTypeAnnotation([
    t.anyTypeAnnotation(),
    t.anyTypeAnnotation(),
  ]);
  expect(getTupleTypeAnnotation(typeNode)).toEqual({
    type: 'TupleTypeAnnotation',
    loc: null,
    types: [
      {type: 'AnyTypeAnnotation', loc: null},
      {type: 'AnyTypeAnnotation', loc: null},
    ],
  });
});

test('getNameFromGenericNode, testing BabelNodeIdentifier', () => {
  const node: BabelNodeIdentifier = t.identifier('test');
  expect(getNameFromGenericNode(node)).toBe('test');
});

test('getNameFromGenericNode, testing BabelNodeQualifiedTypeIdentifier', () => {
  const node: BabelNodeQualifiedTypeIdentifier = t.qualifiedTypeIdentifier(
    t.identifier('test'),
    t.identifier('testQualifier'),
  );
  expect(getNameFromGenericNode(node)).toBe('test');
});

test('getGenericTypeAnnotation, testing a generic type', () => {
  const typeNode: BabelNodeGenericTypeAnnotation = t.genericTypeAnnotation(
    t.identifier('testGeneric'),
    t.typeParameterInstantiation([
      t.anyTypeAnnotation(),
      t.anyTypeAnnotation(),
    ]),
  );
  expect(getGenericTypeAnnotation(typeNode)).toEqual({
    type: 'GenericTypeAnnotation',
    loc: null,
    name: 'testGeneric',
    typeParameters: [
      {type: 'AnyTypeAnnotation', loc: null},
      {type: 'AnyTypeAnnotation', loc: null},
    ],
  });
});

test('getUnionTypeAnnotation, testing an union type', () => {
  const typeNode: BabelNodeUnionTypeAnnotation = t.unionTypeAnnotation([
    t.anyTypeAnnotation(),
    t.anyTypeAnnotation(),
  ]);
  expect(getUnionTypeAnnotation(typeNode)).toEqual({
    type: 'UnionTypeAnnotation',
    loc: null,
    types: [
      {type: 'AnyTypeAnnotation', loc: null},
      {type: 'AnyTypeAnnotation', loc: null},
    ],
  });
});

test('getIntersectionTypeAnnotation, testing an intersection type', () => {
  const typeNode: BabelNodeIntersectionTypeAnnotation =
    t.intersectionTypeAnnotation([
      t.anyTypeAnnotation(),
      t.anyTypeAnnotation(),
    ]);
  expect(getIntersectionTypeAnnotation(typeNode)).toEqual({
    type: 'IntersectionTypeAnnotation',
    loc: null,
    types: [
      {type: 'AnyTypeAnnotation', loc: null},
      {type: 'AnyTypeAnnotation', loc: null},
    ],
  });
});

test('getArrayTypeAnnotation, testing an array of AnyTypeAnnotation', () => {
  const arrayNode: BabelNodeArrayTypeAnnotation = t.arrayTypeAnnotation(
    t.anyTypeAnnotation(),
  );
  expect(getArrayTypeAnnotation(arrayNode)).toEqual({
    type: 'ArrayTypeAnnotation',
    loc: null,
    elementType: {
      type: 'AnyTypeAnnotation',
      loc: null,
    },
  });
});

test('getNumberLiteralTypeAnnotation, testing NumberLiteralType', () => {
  const typeNode: BabelNodeNumberLiteralTypeAnnotation =
    t.numberLiteralTypeAnnotation(4);
  expect(getNumberLiteralTypeAnnotation(typeNode)).toEqual({
    type: 'NumberLiteralTypeAnnotation',
    loc: null,
    value: 4,
  });
});

test('getStringLiteralTypeAnnotation, testing StringLiteralType', () => {
  const typeNode: BabelNodeStringLiteralTypeAnnotation =
    t.stringLiteralTypeAnnotation('test');
  expect(getStringLiteralTypeAnnotation(typeNode)).toEqual({
    type: 'StringLiteralTypeAnnotation',
    loc: null,
    value: 'test',
  });
});
