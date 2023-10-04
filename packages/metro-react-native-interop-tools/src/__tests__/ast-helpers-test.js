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

import * as t from '@babel/types';
import {
  isTurboModule,
  getTypeAnnotation,
  getFunctionTypeParameter,
  getFunctionTypeAnnotation,
  getObjectTypeAnnotation,
  getObjectTypeProperty,
  getObjectTypeSpreadProperty,
  getGenericTypeAnnotation,
  getTupleTypeAnnotation,
  getUnionTypeAnnotation,
  getIntersectionTypeAnnotation,
  getArrayTypeAnnotation,
  getStringLiteralTypeAnnotation,
  getNumberLiteralTypeAnnotation,
  getInterfaceExtends,
  getTypeParameters,
  getNameFromID,
  getNodeLoc,
  getBoundarySchemaFromAST,
} from '../ast-helpers.js';
import {parse} from 'hermes-parser';

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
        loc: null,
        name: 'screenShoudBeKeptOn',
        optional: undefined,
        typeAnnotation: {
          type: 'AnyTypeAnnotation',
          loc: null,
        },
      },
      {
        loc: null,
        name: 'callback',
        optional: undefined,
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
    loc: null,
    name: 'testParam',
    optional: undefined,
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
        optional: null,
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
    optional: null,
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
      type: 'AnyTypeAnnotation',
    },
  });
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

test('getTypeAnnotation, testing BooleanLiteralTypeAnnotation', () => {
  expect(getTypeAnnotation(t.booleanLiteralTypeAnnotation(true))).toEqual({
    type: 'BooleanLiteralTypeAnnotation',
    loc: null,
    value: true,
  });
});

//TODO:T130441624 add test.each instead of creating each test individualy
test('getTypeAnnotation, testing NullLiteralTypeAnnotation', () => {
  expect(getTypeAnnotation(t.nullLiteralTypeAnnotation())).toEqual({
    type: 'NullLiteralTypeAnnotation',
    loc: null,
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

test('getTypeParameters, testing AnyTypeAnnotation parameter', () => {
  const params: Array<BabelNodeFlowType> = [t.anyTypeAnnotation()];
  expect(getTypeParameters(params)).toEqual([
    {
      type: 'AnyTypeAnnotation',
      loc: null,
    },
  ]);
});

test('getInterfaceExtends, testing interface with no parameters', () => {
  const interfaceNode: BabelNodeInterfaceExtends = t.interfaceExtends(
    t.identifier('test'),
    undefined,
  );
  expect(getInterfaceExtends(interfaceNode)).toEqual({
    loc: null,
    name: 'test',
    typeParameters: [],
  });
});

test('getNameFromID, testing BabelNodeIdentifier', () => {
  const node: BabelNodeIdentifier = t.identifier('test');
  expect(getNameFromID(node)).toBe('test');
});

test('getNameFromID, testing BabelNodeQualifiedTypeIdentifier', () => {
  const node: BabelNodeQualifiedTypeIdentifier = t.qualifiedTypeIdentifier(
    t.identifier('test'),
    t.identifier('testQualifier'),
  );
  expect(getNameFromID(node)).toBe('test');
});

test('getNameFromID, testing BabelNodeStringLiteral', () => {
  const node: BabelNodeStringLiteral = t.stringLiteral('test');
  expect(getNameFromID(node)).toBe('test');
});

test('getNodeLoc, testing basic loc', () => {
  // $FlowFixMe[incompatible-exact]
  const ast: BabelNodeFile = parse('test', {
    babel: true,
    sourceType: 'module',
    sourceFilename: 'test.js',
  });
  expect(getNodeLoc(ast.loc)).toEqual({
    start: {
      line: 1,
      column: 0,
    },
    end: {
      line: 1,
      column: 4,
    },
  });
});

test('getNodeLoc, testing undefined loc', () => {
  expect(getNodeLoc(undefined)).toBe(null);
});

test('getBoundarySchemaFromAST, integration test', () => {
  const code: string = `
    export interface Spec extends TurboModule {
      +getConstants: () => {|
        +testGeneric0: Object,
        +testUnion0?: string | string,
        +testIntersection0?: string & string,
        +testTuple0?: [string, number],
        +scale?: number,
        +isSimulator?: boolean,
        +majorOsVersion?: number,
        +isTablet?: boolean,
        +deviceID: string,
      |};
      +setKeepScreenOn: (screenShouldBeKeptOn: boolean) => void;
    }

    const NativeModule: ?Spec = TurboModuleRegistry.get<Spec>('DeviceManager');

    let NativeDeviceManager: ?Spec = null;
    let constants = null;

    if (NativeModule != null) {
      NativeDeviceManager = {
        getConstants(): {|
          +scale?: number,
          +isSimulator?: boolean,
          +majorOsVersion?: number,
          +isTablet?: boolean,
          +deviceID: string,
        |} {
          if (constants == null) {
            constants = NativeModule.getConstants();
          }
          return constants;
        },
        setKeepScreenOn(screenShouldBeKeptOn: boolean): void {
          NativeModule.setKeepScreenOn(screenShouldBeKeptOn);
        },
      };
    }`;
  // $FlowFixMe[incompatible-exact]
  const ast: BabelNodeFile = parse(code, {
    babel: true,
    sourceType: 'module',
    sourceFilename: 'NativeDeviceManager.js',
  });
  expect(getBoundarySchemaFromAST(ast, 'test.js')).toMatchSnapshot();
});
