/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @emails oncall+js_symbolication
 * @flow
 * @format
 */

'use strict';

const {
  generateFunctionMap,
  generateFunctionMappingsArray,
} = require('../generateFunctionMap');
const {parse} = require('@babel/parser');
const {
  SourceMetadataMapConsumer,
} = require('metro-symbolicate/src/Symbolication');

function getAst(source: string) {
  return parse(source, {
    plugins: ['classProperties', 'dynamicImport', 'jsx', 'flow'],
    sourceType: 'unambiguous',
  });
}

// A test helper for compact, readable snapshots
function generateCompactRawMappings(
  ast: BabelNodeFile,
  context: void | $TEMPORARY$object<{filename?: string}>,
) {
  const mappings = generateFunctionMappingsArray(ast, context);
  return (
    '\n' +
    mappings
      .map(
        mapping =>
          `${mapping.name} from ${mapping.start.line}:${mapping.start.column}`,
      )
      .join('\n') +
    '\n'
  );
}

describe('generateFunctionMap', () => {
  it('nested', () => {
    const ast = getAst(`

function parent() {
  function child() {
  }
() => x}
function parent2() {
}
    `);

    expect(generateCompactRawMappings(ast)).toMatchInlineSnapshot(`
      "
      <global> from 1:0
      parent from 3:0
      child from 4:2
      parent from 5:3
      <anonymous> from 6:0
      parent from 6:7
      <global> from 6:8
      parent2 from 7:0
      <global> from 8:1
      "
    `);
    expect(generateFunctionMap(ast)).toMatchInlineSnapshot(`
      Object {
        "mappings": "AAA;ACE;ECC;GDC;AEC,OF,CD;AIC;CJC",
        "names": Array [
          "<global>",
          "parent",
          "child",
          "<anonymous>",
          "parent2",
        ],
      }
    `);
  });

  it('two consecutive functions', () => {
    const ast = getAst('function a(){}function b(){}');

    expect(generateCompactRawMappings(ast)).toMatchInlineSnapshot(`
      "
      a from 1:0
      b from 1:14
      "
    `);
    expect(generateFunctionMap(ast)).toMatchInlineSnapshot(`
      Object {
        "mappings": "AAA,cC",
        "names": Array [
          "a",
          "b",
        ],
      }
    `);
  });

  it('two consecutive functions with a gap', () => {
    const ast = getAst('function a(){} function b(){}');

    expect(generateCompactRawMappings(ast)).toMatchInlineSnapshot(`
      "
      a from 1:0
      <global> from 1:14
      b from 1:15
      "
    `);
    expect(generateFunctionMap(ast)).toMatchInlineSnapshot(`
      Object {
        "mappings": "AAA,cC,CC",
        "names": Array [
          "a",
          "<global>",
          "b",
        ],
      }
    `);
  });

  it('leading code in global', () => {
    const ast = getAst('++x; () => {}');

    expect(generateCompactRawMappings(ast)).toMatchInlineSnapshot(`
      "
      <global> from 1:0
      <anonymous> from 1:5
      "
    `);
    expect(generateFunctionMap(ast)).toMatchInlineSnapshot(`
      Object {
        "mappings": "AAA,KC",
        "names": Array [
          "<global>",
          "<anonymous>",
        ],
      }
    `);
  });

  it('trailing code in global', () => {
    const ast = getAst('() => {}; ++x');

    expect(generateCompactRawMappings(ast)).toMatchInlineSnapshot(`
      "
      <anonymous> from 1:0
      <global> from 1:8
      "
    `);
    expect(generateFunctionMap(ast)).toMatchInlineSnapshot(`
      Object {
        "mappings": "AAA,QC",
        "names": Array [
          "<anonymous>",
          "<global>",
        ],
      }
    `);
  });

  it('object method', () => {
    const ast = getAst(`(
      {
        m() {
          ++x;
        }
      }
    )`);

    expect(generateCompactRawMappings(ast)).toMatchInlineSnapshot(`
      "
      <global> from 1:0
      m from 3:8
      <global> from 5:9
      "
    `);
    expect(generateFunctionMap(ast)).toMatchInlineSnapshot(`
      Object {
        "mappings": "AAA;QCE;SDE",
        "names": Array [
          "<global>",
          "m",
        ],
      }
    `);
  });

  it('object setter', () => {
    const ast = getAst(`(
      {
        set m(x) {
          ++x;
        }
      }
    )`);

    expect(generateCompactRawMappings(ast)).toMatchInlineSnapshot(`
      "
      <global> from 1:0
      set__m from 3:8
      <global> from 5:9
      "
    `);
    expect(generateFunctionMap(ast)).toMatchInlineSnapshot(`
      Object {
        "mappings": "AAA;QCE;SDE",
        "names": Array [
          "<global>",
          "set__m",
        ],
      }
    `);
  });

  it('object getter', () => {
    const ast = getAst(`(
      {
        get m() {
          ++x;
        }
      }
    )`);

    expect(generateCompactRawMappings(ast)).toMatchInlineSnapshot(`
      "
      <global> from 1:0
      get__m from 3:8
      <global> from 5:9
      "
    `);
    expect(generateFunctionMap(ast)).toMatchInlineSnapshot(`
      Object {
        "mappings": "AAA;QCE;SDE",
        "names": Array [
          "<global>",
          "get__m",
        ],
      }
    `);
  });

  it('object property', () => {
    const ast = getAst(`(
      {
        m: function () {
          ++x;
        }
      }
    )`);

    expect(generateCompactRawMappings(ast)).toMatchInlineSnapshot(`
      "
      <global> from 1:0
      m from 3:11
      <global> from 5:9
      "
    `);
    expect(generateFunctionMap(ast)).toMatchInlineSnapshot(`
      Object {
        "mappings": "AAA;WCE;SDE",
        "names": Array [
          "<global>",
          "m",
        ],
      }
    `);
  });

  it('class method', () => {
    const ast = getAst(`
      class C {
        m() {
          ++x;
        }
      }
    `);

    expect(generateCompactRawMappings(ast)).toMatchInlineSnapshot(`
      "
      <global> from 1:0
      C from 2:6
      C#m from 3:8
      C from 5:9
      <global> from 6:7
      "
    `);
    expect(generateFunctionMap(ast)).toMatchInlineSnapshot(`
      Object {
        "mappings": "AAA;MCC;QCC;SDE;ODC",
        "names": Array [
          "<global>",
          "C",
          "C#m",
        ],
      }
    `);
  });

  it('class constructor', () => {
    const ast = getAst(`
      class C {
        constructor() {
          ++x;
        }
      }
    `);

    expect(generateCompactRawMappings(ast)).toMatchInlineSnapshot(`
      "
      <global> from 1:0
      C from 2:6
      C#constructor from 3:8
      C from 5:9
      <global> from 6:7
      "
    `);
    expect(generateFunctionMap(ast)).toMatchInlineSnapshot(`
      Object {
        "mappings": "AAA;MCC;QCC;SDE;ODC",
        "names": Array [
          "<global>",
          "C",
          "C#constructor",
        ],
      }
    `);
  });

  it('class setter', () => {
    const ast = getAst(`
      class C {
        set m(x) {
          ++x;
        }
      }
    `);

    expect(generateCompactRawMappings(ast)).toMatchInlineSnapshot(`
      "
      <global> from 1:0
      C from 2:6
      C#set__m from 3:8
      C from 5:9
      <global> from 6:7
      "
    `);
    expect(generateFunctionMap(ast)).toMatchInlineSnapshot(`
      Object {
        "mappings": "AAA;MCC;QCC;SDE;ODC",
        "names": Array [
          "<global>",
          "C",
          "C#set__m",
        ],
      }
    `);
  });

  it('class getter', () => {
    const ast = getAst(`
      class C {
        get m() {
          ++x;
        }
      }
    `);

    expect(generateCompactRawMappings(ast)).toMatchInlineSnapshot(`
      "
      <global> from 1:0
      C from 2:6
      C#get__m from 3:8
      C from 5:9
      <global> from 6:7
      "
    `);
    expect(generateFunctionMap(ast)).toMatchInlineSnapshot(`
      Object {
        "mappings": "AAA;MCC;QCC;SDE;ODC",
        "names": Array [
          "<global>",
          "C",
          "C#get__m",
        ],
      }
    `);
  });

  it('class property', () => {
    const ast = getAst(`
      class C {
        m = function () {
          ++x;
        }
      }
    `);

    expect(generateCompactRawMappings(ast)).toMatchInlineSnapshot(`
      "
      <global> from 1:0
      C from 2:6
      C#m from 3:12
      C from 5:9
      <global> from 6:7
      "
    `);
    expect(generateFunctionMap(ast)).toMatchInlineSnapshot(`
      Object {
        "mappings": "AAA;MCC;YCC;SDE;ODC",
        "names": Array [
          "<global>",
          "C",
          "C#m",
        ],
      }
    `);
  });

  it('class static method', () => {
    const ast = getAst(`
      class C {
        static m() {
          ++x;
        }
      }
    `);

    expect(generateCompactRawMappings(ast)).toMatchInlineSnapshot(`
      "
      <global> from 1:0
      C from 2:6
      C.m from 3:8
      C from 5:9
      <global> from 6:7
      "
    `);
    expect(generateFunctionMap(ast)).toMatchInlineSnapshot(`
      Object {
        "mappings": "AAA;MCC;QCC;SDE;ODC",
        "names": Array [
          "<global>",
          "C",
          "C.m",
        ],
      }
    `);
  });

  it('class static setter', () => {
    const ast = getAst(`
      class C {
        static set m(x) {
          ++x;
        }
      }
    `);

    expect(generateCompactRawMappings(ast)).toMatchInlineSnapshot(`
      "
      <global> from 1:0
      C from 2:6
      C.set__m from 3:8
      C from 5:9
      <global> from 6:7
      "
    `);
    expect(generateFunctionMap(ast)).toMatchInlineSnapshot(`
      Object {
        "mappings": "AAA;MCC;QCC;SDE;ODC",
        "names": Array [
          "<global>",
          "C",
          "C.set__m",
        ],
      }
    `);
  });

  it('class static getter', () => {
    const ast = getAst(`
      class C {
        static get m() {
          ++x;
        }
      }
    `);

    expect(generateCompactRawMappings(ast)).toMatchInlineSnapshot(`
      "
      <global> from 1:0
      C from 2:6
      C.get__m from 3:8
      C from 5:9
      <global> from 6:7
      "
    `);
    expect(generateFunctionMap(ast)).toMatchInlineSnapshot(`
      Object {
        "mappings": "AAA;MCC;QCC;SDE;ODC",
        "names": Array [
          "<global>",
          "C",
          "C.get__m",
        ],
      }
    `);
  });

  it('class static property', () => {
    const ast = getAst(`
      class C {
        static m = function () {
          ++x;
        }
      }
    `);

    expect(generateCompactRawMappings(ast)).toMatchInlineSnapshot(`
      "
      <global> from 1:0
      C from 2:6
      C.m from 3:19
      C from 5:9
      <global> from 6:7
      "
    `);
    expect(generateFunctionMap(ast)).toMatchInlineSnapshot(`
      Object {
        "mappings": "AAA;MCC;mBCC;SDE;ODC",
        "names": Array [
          "<global>",
          "C",
          "C.m",
        ],
      }
    `);
  });

  it('method of anonymous class', () => {
    const ast = getAst(`(
      class {
        m() {
          ++x;
        }
      }
    )`);

    expect(generateCompactRawMappings(ast)).toMatchInlineSnapshot(`
      "
      <global> from 1:0
      <anonymous> from 2:6
      m from 3:8
      <anonymous> from 5:9
      <global> from 6:7
      "
    `);
    expect(generateFunctionMap(ast)).toMatchInlineSnapshot(`
      Object {
        "mappings": "AAA;MCC;QCC;SDE;ODC",
        "names": Array [
          "<global>",
          "<anonymous>",
          "m",
        ],
      }
    `);
  });

  it('method of anonymous class with inferred name', () => {
    const ast = getAst(`
      const C = class {
        m() {
          ++x;
        }
      }
    `);

    expect(generateCompactRawMappings(ast)).toMatchInlineSnapshot(`
      "
      <global> from 1:0
      C from 2:16
      C#m from 3:8
      C from 5:9
      <global> from 6:7
      "
    `);
    expect(generateFunctionMap(ast)).toMatchInlineSnapshot(`
      Object {
        "mappings": "AAA;gBCC;QCC;SDE;ODC",
        "names": Array [
          "<global>",
          "C",
          "C#m",
        ],
      }
    `);
  });

  it('method of object with inferred name', () => {
    const ast = getAst(`
      const obj = {
        m() {
          ++x;
        }
      }
    `);

    expect(generateCompactRawMappings(ast)).toMatchInlineSnapshot(`
      "
      <global> from 1:0
      obj.m from 3:8
      <global> from 5:9
      "
    `);
    expect(generateFunctionMap(ast)).toMatchInlineSnapshot(`
      Object {
        "mappings": "AAA;QCE;SDE",
        "names": Array [
          "<global>",
          "obj.m",
        ],
      }
    `);
  });

  it('method of object with nested inferred names', () => {
    const ast = getAst(`
      const obj = {
        obj2: {
          m() {
            ++x;
          }
        }
      }
    `);

    expect(generateCompactRawMappings(ast)).toMatchInlineSnapshot(`
      "
      <global> from 1:0
      obj.obj2.m from 4:10
      <global> from 6:11
      "
    `);
    expect(generateFunctionMap(ast)).toMatchInlineSnapshot(`
      Object {
        "mappings": "AAA;UCG;WDE",
        "names": Array [
          "<global>",
          "obj.obj2.m",
        ],
      }
    `);
  });

  it('setter method of object with inferred name', () => {
    const ast = getAst(`
      var obj = {
        set m(x) {
          ++x;
        }
      }
    `);

    expect(generateCompactRawMappings(ast)).toMatchInlineSnapshot(`
      "
      <global> from 1:0
      obj.set__m from 3:8
      <global> from 5:9
      "
    `);
    expect(generateFunctionMap(ast)).toMatchInlineSnapshot(`
      Object {
        "mappings": "AAA;QCE;SDE",
        "names": Array [
          "<global>",
          "obj.set__m",
        ],
      }
    `);
  });

  it('method with well-known symbol as key', () => {
    const ast = getAst(`
      class C {
        [Symbol.iterator]() {
          ++x;
        }
      }
    `);

    expect(generateCompactRawMappings(ast)).toMatchInlineSnapshot(`
      "
      <global> from 1:0
      C from 2:6
      C#@@iterator from 3:8
      C from 5:9
      <global> from 6:7
      "
    `);
    expect(generateFunctionMap(ast)).toMatchInlineSnapshot(`
      Object {
        "mappings": "AAA;MCC;QCC;SDE;ODC",
        "names": Array [
          "<global>",
          "C",
          "C#@@iterator",
        ],
      }
    `);
  });

  it('method with computed property as key', () => {
    // NOTE: This will derive 'C#foo.bar' - not ideal but probably good enough.
    const ast = getAst(`
      class C {
        [foo.bar]() {
          ++x;
        }
      }
    `);

    expect(generateCompactRawMappings(ast)).toMatchInlineSnapshot(`
      "
      <global> from 1:0
      C from 2:6
      C#foo.bar from 3:8
      C from 5:9
      <global> from 6:7
      "
    `);
    expect(generateFunctionMap(ast)).toMatchInlineSnapshot(`
      Object {
        "mappings": "AAA;MCC;QCC;SDE;ODC",
        "names": Array [
          "<global>",
          "C",
          "C#foo.bar",
        ],
      }
    `);
  });

  it('derive name from member expression', () => {
    const ast = getAst(`
      module.exports = function() {}
    `);

    expect(generateCompactRawMappings(ast)).toMatchInlineSnapshot(`
      "
      <global> from 1:0
      module.exports from 2:23
      <global> from 2:36
      "
    `);
    expect(generateFunctionMap(ast)).toMatchInlineSnapshot(`
      Object {
        "mappings": "AAA;uBCC,aD",
        "names": Array [
          "<global>",
          "module.exports",
        ],
      }
    `);
  });

  it('derive name from partial member expression', () => {
    const ast = getAst(`
      obj[opaque() + 1].foo.bar = function() {}
    `);

    expect(generateCompactRawMappings(ast)).toMatchInlineSnapshot(`
      "
      <global> from 1:0
      foo.bar from 2:34
      <global> from 2:47
      "
    `);
    expect(generateFunctionMap(ast)).toMatchInlineSnapshot(`
      Object {
        "mappings": "AAA;kCCC,aD",
        "names": Array [
          "<global>",
          "foo.bar",
        ],
      }
    `);
  });

  it('chained class and object name inference', () => {
    const ast = getAst(`
      var a = {
        b: class {
          static c = function () {}
        }
      }
    `);

    expect(generateCompactRawMappings(ast)).toMatchInlineSnapshot(`
      "
      <global> from 1:0
      a.b from 3:11
      a.b.c from 4:21
      a.b from 4:35
      <global> from 5:9
      "
    `);
    expect(generateFunctionMap(ast)).toMatchInlineSnapshot(`
      Object {
        "mappings": "AAA;WCE;qBCC,cD;SDC",
        "names": Array [
          "<global>",
          "a.b",
          "a.b.c",
        ],
      }
    `);
  });

  it('callback', () => {
    const ast = getAst(`
      useEffect(() => {}, [])
    `);

    expect(generateCompactRawMappings(ast)).toMatchInlineSnapshot(`
      "
      <global> from 1:0
      useEffect$argument_0 from 2:16
      <global> from 2:24
      "
    `);
    expect(generateFunctionMap(ast)).toMatchInlineSnapshot(`
      Object {
        "mappings": "AAA;gBCC,QD",
        "names": Array [
          "<global>",
          "useEffect$argument_0",
        ],
      }
    `);
  });

  it('thenable', () => {
    const ast = getAst(`
      foo(bar).then(() => {})
    `);

    expect(generateCompactRawMappings(ast)).toMatchInlineSnapshot(`
      "
      <global> from 1:0
      foo.then$argument_0 from 2:20
      <global> from 2:28
      "
    `);
    expect(generateFunctionMap(ast)).toMatchInlineSnapshot(`
      Object {
        "mappings": "AAA;oBCC,QD",
        "names": Array [
          "<global>",
          "foo.then$argument_0",
        ],
      }
    `);
  });

  it('dynamic import handler', () => {
    const ast = getAst(`
      import('foo').then(() => {})
    `);

    expect(generateCompactRawMappings(ast)).toMatchInlineSnapshot(`
      "
      <global> from 1:0
      import.then$argument_0 from 2:25
      <global> from 2:33
      "
    `);
    expect(generateFunctionMap(ast)).toMatchInlineSnapshot(`
      Object {
        "mappings": "AAA;yBCC,QD",
        "names": Array [
          "<global>",
          "import.then$argument_0",
        ],
      }
    `);
  });

  it('callback of optional method', () => {
    const ast = getAst(`
      object?.method(() => {}, [])
    `);

    expect(generateCompactRawMappings(ast)).toMatchInlineSnapshot(`
      "
      <global> from 1:0
      object.method$argument_0 from 2:21
      <global> from 2:29
      "
    `);
    expect(generateFunctionMap(ast)).toMatchInlineSnapshot(`
      Object {
        "mappings": "AAA;qBCC,QD",
        "names": Array [
          "<global>",
          "object.method$argument_0",
        ],
      }
    `);
  });

  it('optional call', () => {
    const ast = getAst(`
      func?.(() => {}, [])
    `);

    expect(generateCompactRawMappings(ast)).toMatchInlineSnapshot(`
      "
      <global> from 1:0
      func$argument_0 from 2:13
      <global> from 2:21
      "
    `);
    expect(generateFunctionMap(ast)).toMatchInlineSnapshot(`
      Object {
        "mappings": "AAA;aCC,QD",
        "names": Array [
          "<global>",
          "func$argument_0",
        ],
      }
    `);
  });

  it('JSX prop', () => {
    const ast = getAst(`
      <Button onClick={() => {}} />
    `);

    expect(generateCompactRawMappings(ast)).toMatchInlineSnapshot(`
      "
      <global> from 1:0
      Button.props.onClick from 2:23
      <global> from 2:31
      "
    `);
    expect(generateFunctionMap(ast)).toMatchInlineSnapshot(`
      Object {
        "mappings": "AAA;uBCC,QD",
        "names": Array [
          "<global>",
          "Button.props.onClick",
        ],
      }
    `);
  });

  it('JSX spread prop is anonymous', () => {
    // NOTE: Unlikely case, just here as a sanity check
    const ast = getAst(`
      <Button {...(() => {})} />
    `);

    expect(generateCompactRawMappings(ast)).toMatchInlineSnapshot(`
      "
      <global> from 1:0
      <anonymous> from 2:19
      <global> from 2:27
      "
    `);
    expect(generateFunctionMap(ast)).toMatchInlineSnapshot(`
      Object {
        "mappings": "AAA;mBCC,QD",
        "names": Array [
          "<global>",
          "<anonymous>",
        ],
      }
    `);
  });

  it('JSX child', () => {
    const ast = getAst(`
      <Button>{() => {}}</Button>
    `);

    expect(generateCompactRawMappings(ast)).toMatchInlineSnapshot(`
      "
      <global> from 1:0
      Button.props.children from 2:15
      <global> from 2:23
      "
    `);
    expect(generateFunctionMap(ast)).toMatchInlineSnapshot(`
      Object {
        "mappings": "AAA;eCC,QD",
        "names": Array [
          "<global>",
          "Button.props.children",
        ],
      }
    `);
  });

  it('empty program', () => {
    const ast = getAst('');

    expect(generateCompactRawMappings(ast).trim()).toBe('');
    expect(generateFunctionMap(ast)).toMatchInlineSnapshot(`
      Object {
        "mappings": "",
        "names": Array [],
      }
    `);
  });

  it('IIFE is anonymous', () => {
    const ast = getAst('(() => {})()');

    expect(generateCompactRawMappings(ast)).toMatchInlineSnapshot(`
      "
      <global> from 1:0
      <anonymous> from 1:1
      <global> from 1:9
      "
    `);
    expect(generateFunctionMap(ast)).toMatchInlineSnapshot(`
      Object {
        "mappings": "AAA,CC,QD",
        "names": Array [
          "<global>",
          "<anonymous>",
        ],
      }
    `);
  });

  it('IIFE assigned to a variable is anonymous', () => {
    const ast = getAst('const value = (() => {})()');

    expect(generateCompactRawMappings(ast)).toMatchInlineSnapshot(`
      "
      <global> from 1:0
      <anonymous> from 1:15
      <global> from 1:23
      "
    `);
    expect(generateFunctionMap(ast)).toMatchInlineSnapshot(`
      Object {
        "mappings": "AAA,eC,QD",
        "names": Array [
          "<global>",
          "<anonymous>",
        ],
      }
    `);
  });

  it('derive name from new expression', () => {
    const ast = getAst('new Foo(() => {});');

    expect(generateCompactRawMappings(ast)).toMatchInlineSnapshot(`
      "
      <global> from 1:0
      Foo$argument_0 from 1:8
      <global> from 1:16
      "
    `);
    expect(generateFunctionMap(ast)).toMatchInlineSnapshot(`
      Object {
        "mappings": "AAA,QC,QD",
        "names": Array [
          "<global>",
          "Foo$argument_0",
        ],
      }
    `);
  });

  it('collapses call chains', () => {
    const ast = getAst(
      'factory().setOne().setTwo().setThree().setFour().setFive(() => {})',
    );

    expect(generateCompactRawMappings(ast)).toMatchInlineSnapshot(`
      "
      <global> from 1:0
      factory.setOne...setFour.setFive$argument_0 from 1:57
      <global> from 1:65
      "
    `);
    expect(generateFunctionMap(ast)).toMatchInlineSnapshot(`
      Object {
        "mappings": "AAA,yDC,QD",
        "names": Array [
          "<global>",
          "factory.setOne...setFour.setFive$argument_0",
        ],
      }
    `);
  });

  it('derive name from member of typecast', () => {
    const ast = getAst(`
      (foo : T).bar = () => {}
    `);

    expect(generateCompactRawMappings(ast)).toMatchInlineSnapshot(`
      "
      <global> from 1:0
      foo.bar from 2:22
      <global> from 2:30
      "
    `);
    expect(generateFunctionMap(ast)).toMatchInlineSnapshot(`
      Object {
        "mappings": "AAA;sBCC,QD",
        "names": Array [
          "<global>",
          "foo.bar",
        ],
      }
    `);
  });

  it('derive name from assignment target of a typecast', () => {
    const ast = getAst(`
      const foo = (() => {}: Bar);
    `);

    expect(generateCompactRawMappings(ast)).toMatchInlineSnapshot(`
      "
      <global> from 1:0
      foo from 2:19
      <global> from 2:27
      "
    `);
    expect(generateFunctionMap(ast)).toMatchInlineSnapshot(`
      Object {
        "mappings": "AAA;mBCC,QD",
        "names": Array [
          "<global>",
          "foo",
        ],
      }
    `);
  });

  it('skip Object.freeze when inferring object name', () => {
    const ast = getAst(`
      var a = Object.freeze({
        b: () => {}
      })
    `);

    expect(generateCompactRawMappings(ast)).toMatchInlineSnapshot(`
      "
      <global> from 1:0
      a.b from 3:11
      <global> from 3:19
      "
    `);
    expect(generateFunctionMap(ast)).toMatchInlineSnapshot(`
      Object {
        "mappings": "AAA;WCE,QD",
        "names": Array [
          "<global>",
          "a.b",
        ],
      }
    `);
  });

  it('skip typecast when inferring object name', () => {
    const ast = getAst(`
      var a = ({
        b: () => {}
      }: Type)
    `);

    expect(generateCompactRawMappings(ast)).toMatchInlineSnapshot(`
      "
      <global> from 1:0
      a.b from 3:11
      <global> from 3:19
      "
    `);
    expect(generateFunctionMap(ast)).toMatchInlineSnapshot(`
      Object {
        "mappings": "AAA;WCE,QD",
        "names": Array [
          "<global>",
          "a.b",
        ],
      }
    `);
  });

  it('omit parent class name when it matches filename', () => {
    const ast = getAst('class FooBar { baz() {} }');
    const context = {filename: 'FooBar.ios.js'};

    expect(generateCompactRawMappings(ast, context)).toMatchInlineSnapshot(`
      "
      FooBar from 1:0
      baz from 1:15
      FooBar from 1:23
      "
    `);
    expect(generateFunctionMap(ast, context)).toMatchInlineSnapshot(`
      Object {
        "mappings": "AAA,eC,QD",
        "names": Array [
          "FooBar",
          "baz",
        ],
      }
    `);
  });

  it('do not omit parent class name when it only partially matches filename', () => {
    const ast = getAst('class FooBarItem { baz() {} }');
    const context = {filename: 'FooBar.ios.js'};

    expect(generateCompactRawMappings(ast, context)).toMatchInlineSnapshot(`
      "
      FooBarItem from 1:0
      FooBarItem#baz from 1:19
      FooBarItem from 1:27
      "
    `);
    expect(generateFunctionMap(ast, context)).toMatchInlineSnapshot(`
      Object {
        "mappings": "AAA,mBC,QD",
        "names": Array [
          "FooBarItem",
          "FooBarItem#baz",
        ],
      }
    `);
  });

  it('derive name from simple assignment even if it matches the filename', () => {
    const ast = getAst('var FooBar = () => {}');
    const context = {filename: 'FooBar.ios.js'};

    expect(generateCompactRawMappings(ast, context)).toMatchInlineSnapshot(`
      "
      <global> from 1:0
      FooBar from 1:13
      "
    `);
    expect(generateFunctionMap(ast, context)).toMatchInlineSnapshot(`
      Object {
        "mappings": "AAA,aC",
        "names": Array [
          "<global>",
          "FooBar",
        ],
      }
    `);
  });

  it('round trip encoding/decoding and lookup', () => {
    const ast = getAst(`

function parent() {
  function child() {
  }
() => x}
function parent2() {
}
    `);

    const mappings = generateFunctionMappingsArray(ast);
    const encoded = generateFunctionMap(ast);

    const sourceMap = {
      version: 3,
      sources: ['input.js'],
      names: [],
      mappings: '',
      x_facebook_sources: [[encoded]],
    };

    const consumer = new SourceMetadataMapConsumer(sourceMap);
    let prev;
    for (const mapping of mappings) {
      const {
        start: {line, column},
        name,
      } = mapping;
      if (
        prev &&
        (prev.start.line < line ||
          (prev.start.line === line && prev.start.column + 1 < column))
      ) {
        // Check positions that aren't at the start of a mapping
        expect(
          consumer.functionNameFor({
            line: prev.start.line,
            column: prev.start.column + 1,
            source: 'input.js',
          }),
        ).toBe(prev.name);

        expect(
          consumer.functionNameFor({
            line,
            column: column - 1,
            source: 'input.js',
          }),
        ).toBe(prev.name);
      }
      expect(consumer.functionNameFor({line, column, source: 'input.js'})).toBe(
        name,
      );
      prev = mapping;
    }
    if (prev) {
      expect(
        consumer.functionNameFor({
          line: 99999,
          column: 99999,
          source: 'input.js',
        }),
      ).toBe(prev.name);
    }
  });

  it('records class names like functions', () => {
    const ast = getAst('class Foo {}');

    expect(generateCompactRawMappings(ast)).toMatchInlineSnapshot(`
      "
      Foo from 1:0
      "
    `);
    expect(generateFunctionMap(ast)).toMatchInlineSnapshot(`
      Object {
        "mappings": "AAA",
        "names": Array [
          "Foo",
        ],
      }
    `);
  });

  it('infers a name for the default export', () => {
    const ast = getAst('export default function() {}');

    expect(generateCompactRawMappings(ast)).toMatchInlineSnapshot(`
      "
      <global> from 1:0
      default from 1:15
      "
    `);
    expect(generateFunctionMap(ast)).toMatchInlineSnapshot(`
      Object {
        "mappings": "AAA,eC",
        "names": Array [
          "<global>",
          "default",
        ],
      }
    `);
  });

  it('infers a name for methods of the default export', () => {
    const ast = getAst('export default class {foo() {}}');

    expect(generateCompactRawMappings(ast)).toMatchInlineSnapshot(`
      "
      <global> from 1:0
      default from 1:15
      default#foo from 1:22
      default from 1:30
      "
    `);
    expect(generateFunctionMap(ast)).toMatchInlineSnapshot(`
      Object {
        "mappings": "AAA,eC,OC,QD",
        "names": Array [
          "<global>",
          "default",
          "default#foo",
        ],
      }
    `);
  });

  it("prefers the default export's name where available", () => {
    const ast = getAst('export default class Foo {bar() {}}');

    expect(generateCompactRawMappings(ast)).toMatchInlineSnapshot(`
      "
      <global> from 1:0
      Foo from 1:15
      Foo#bar from 1:26
      Foo from 1:34
      "
    `);
    expect(generateFunctionMap(ast)).toMatchInlineSnapshot(`
      Object {
        "mappings": "AAA,eC,WC,QD",
        "names": Array [
          "<global>",
          "Foo",
          "Foo#bar",
        ],
      }
    `);
  });

  it('method of generic class', () => {
    const ast = getAst(`
      class C<T> {
        m() {
          ++x;
        }
      }
    `);

    expect(generateCompactRawMappings(ast)).toMatchInlineSnapshot(`
      "
      <global> from 1:0
      C from 2:6
      C#m from 3:8
      C from 5:9
      <global> from 6:7
      "
    `);
    expect(generateFunctionMap(ast)).toMatchInlineSnapshot(`
      Object {
        "mappings": "AAA;MCC;QCC;SDE;ODC",
        "names": Array [
          "<global>",
          "C",
          "C#m",
        ],
      }
    `);
  });

  it('generic method of class', () => {
    const ast = getAst(`
      class C {
        m<T>() {
          ++x;
        }
      }
    `);

    expect(generateCompactRawMappings(ast)).toMatchInlineSnapshot(`
      "
      <global> from 1:0
      C from 2:6
      C#m from 3:8
      C from 5:9
      <global> from 6:7
      "
    `);
    expect(generateFunctionMap(ast)).toMatchInlineSnapshot(`
      Object {
        "mappings": "AAA;MCC;QCC;SDE;ODC",
        "names": Array [
          "<global>",
          "C",
          "C#m",
        ],
      }
    `);
  });

  it('generic function', () => {
    const ast = getAst('function a<T>(){}');

    expect(generateCompactRawMappings(ast)).toMatchInlineSnapshot(`
      "
      a from 1:0
      "
    `);
    expect(generateFunctionMap(ast)).toMatchInlineSnapshot(`
      Object {
        "mappings": "AAA",
        "names": Array [
          "a",
        ],
      }
    `);
  });

  describe('React hooks', () => {
    it('useCallback', () => {
      const ast = getAst('const cb = useCallback(() => {})');

      expect(generateCompactRawMappings(ast)).toMatchInlineSnapshot(`
        "
        <global> from 1:0
        cb from 1:23
        <global> from 1:31
        "
      `);
      expect(generateFunctionMap(ast)).toMatchInlineSnapshot(`
        Object {
          "mappings": "AAA,uBC,QD",
          "names": Array [
            "<global>",
            "cb",
          ],
        }
      `);
    });

    it('useCallback with deps', () => {
      const ast = getAst('const cb = useCallback(() => {}, [dep1, dep2])');

      expect(generateCompactRawMappings(ast)).toMatchInlineSnapshot(`
        "
        <global> from 1:0
        cb from 1:23
        <global> from 1:31
        "
      `);
      expect(generateFunctionMap(ast)).toMatchInlineSnapshot(`
        Object {
          "mappings": "AAA,uBC,QD",
          "names": Array [
            "<global>",
            "cb",
          ],
        }
      `);
    });

    it('React.useCallback', () => {
      const ast = getAst('const cb = React.useCallback(() => {})');

      expect(generateCompactRawMappings(ast)).toMatchInlineSnapshot(`
        "
        <global> from 1:0
        cb from 1:29
        <global> from 1:37
        "
      `);
      expect(generateFunctionMap(ast)).toMatchInlineSnapshot(`
        Object {
          "mappings": "AAA,6BC,QD",
          "names": Array [
            "<global>",
            "cb",
          ],
        }
      `);
    });

    it('treats SomeOtherNamespace.useCallback like any other function', () => {
      const ast = getAst('const cb = SomeOtherNamespace.useCallback(() => {})');

      expect(generateCompactRawMappings(ast)).toMatchInlineSnapshot(`
        "
        <global> from 1:0
        SomeOtherNamespace.useCallback$argument_0 from 1:42
        <global> from 1:50
        "
      `);
      expect(generateFunctionMap(ast)).toMatchInlineSnapshot(`
        Object {
          "mappings": "AAA,0CC,QD",
          "names": Array [
            "<global>",
            "SomeOtherNamespace.useCallback$argument_0",
          ],
        }
      `);
    });

    it('named callback takes precedence', () => {
      const ast = getAst('const cb = useCallback(function inner() {})');

      expect(generateCompactRawMappings(ast)).toMatchInlineSnapshot(`
        "
        <global> from 1:0
        inner from 1:23
        <global> from 1:42
        "
      `);
      expect(generateFunctionMap(ast)).toMatchInlineSnapshot(`
        Object {
          "mappings": "AAA,uBC,mBD",
          "names": Array [
            "<global>",
            "inner",
          ],
        }
      `);
    });
  });
});
