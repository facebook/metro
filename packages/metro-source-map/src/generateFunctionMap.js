/**
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow
 * @format
 */

'use strict';

const B64Builder = require('./B64Builder');

const fsPath = require('path');
const nullthrows = require('nullthrows');
const t = require('@babel/types');

import type {FBSourceFunctionMap} from './source-map';
import traverse from '@babel/traverse';
import type {NodePath} from '@babel/traverse';
import {
  isProgram,
  isIdentifier,
  isJSXIdentifier,
  isCallExpression,
  isNewExpression,
  isTypeCastExpression,
  isRegExpLiteral,
  isTemplateLiteral,
  isLiteral,
  isObjectMethod,
  isClassMethod,
  isObjectProperty,
  isClassProperty,
  isVariableDeclarator,
  isAssignmentExpression,
  isJSXExpressionContainer,
  isJSXElement,
  isJSXAttribute,
  isNullLiteral,
  isImport,
  isClassBody,
  isObjectExpression,
  isExportDefaultDeclaration,
} from '@babel/types';
import type {Node} from '@babel/types';

type Position = {
  line: number,
  column: number,
  ...
};
type RangeMapping = {
  name: string,
  start: Position,
  ...
};
type Context = {filename?: string, ...};

/**
 * Generate a map of source positions to function names. The names are meant to
 * describe the stack frame in an error trace and may contain more contextual
 * information than just the actual name of the function.
 *
 * The output is encoded for use in a source map. For details about the format,
 * see MappingEncoder below.
 */
function generateFunctionMap(
  ast: BabelNode,
  context?: Context,
): FBSourceFunctionMap {
  const encoder = new MappingEncoder();
  forEachMapping(ast, context, mapping => encoder.push(mapping));
  return encoder.getResult();
}

/**
 * Same as generateFunctionMap, but returns the raw array of mappings instead
 * of encoding it for use in a source map.
 *
 * Lines are 1-based and columns are 0-based.
 */
function generateFunctionMappingsArray(
  ast: BabelNode,
  context?: Context,
): $ReadOnlyArray<RangeMapping> {
  const mappings = [];
  forEachMapping(ast, context, mapping => {
    mappings.push(mapping);
  });
  return mappings;
}

/**
 * Traverses a Babel AST and calls the supplied callback with function name
 * mappings, one at a time.
 */
function forEachMapping(
  ast: BabelNode,
  context: ?Context,
  pushMapping: RangeMapping => void,
) {
  const nameStack = [];
  let tailPos = {line: 1, column: 0};
  let tailName = null;

  function advanceToPos(pos) {
    if (tailPos && positionGreater(pos, tailPos)) {
      const name = nameStack[0].name; // We always have at least Program
      if (name !== tailName) {
        pushMapping({
          name,
          start: {line: tailPos.line, column: tailPos.column},
        });
        tailName = name;
      }
    }
    tailPos = pos;
  }

  function pushFrame(name: string, loc: BabelNodeSourceLocation) {
    advanceToPos(loc.start);
    nameStack.unshift({name, loc});
  }

  function popFrame() {
    const top = nameStack[0];
    if (top) {
      const {loc} = top;
      advanceToPos(loc.end);
      nameStack.shift();
    }
  }

  if (!context) {
    context = {};
  }

  const basename = context.filename
    ? fsPath.basename(context.filename).replace(/\..+$/, '')
    : null;

  const visitor = {
    enter(path) {
      let name = getNameForPath(path);
      if (basename) {
        name = removeNamePrefix(name, basename);
      }

      pushFrame(name, nullthrows(path.node.loc));
    },

    exit(path): void {
      popFrame();
    },
  };

  traverse(ast, {
    Function: visitor,
    Program: visitor,
    Class: visitor,
  });
}

const ANONYMOUS_NAME = '<anonymous>';
const CALLEES_TO_SKIP = ['Object.freeze'];

/**
 * Derive a contextual name for the given AST node (Function, Program, Class or
 * ObjectExpression).
 */
function getNameForPath(path: NodePath<>): string {
  const {node, parent, parentPath} = path;
  if (isProgram(node)) {
    return '<global>';
  }

  let {id} = (path: any);
  // has an `id` so we don't need to infer one
  if (node.id) {
    // $FlowFixMe Flow error uncovered by typing Babel more strictly
    return node.id.name;
  }
  let propertyPath;
  let kind = '';

  // Find or construct an AST node that names the current node.
  if (isObjectMethod(node) || isClassMethod(node)) {
    // ({ foo() {} });
    id = node.key;
    if (node.kind !== 'method' && node.kind !== 'constructor') {
      // Store the method's kind so we can add it to the final name.
      kind = node.kind;
    }
    // Also store the path to the property so we can find its context
    // (object/class) later and add _its_ name to the result.
    propertyPath = path;
  } else if (isObjectProperty(parent) || isClassProperty(parent)) {
    // ({ foo: function() {} });
    id = parent.key;
    // Also store the path to the property so we can find its context
    // (object/class) later and add _its_ name to the result.
    propertyPath = parentPath;
  } else if (isVariableDeclarator(parent)) {
    // let foo = function () {};
    id = parent.id;
  } else if (isAssignmentExpression(parent)) {
    // foo = function () {};
    id = parent.left;
  } else if (isJSXExpressionContainer(parent)) {
    const grandParentNode = parentPath?.parentPath?.node;
    if (isJSXElement(grandParentNode)) {
      // <foo>{function () {}}</foo>
      const openingElement = grandParentNode.openingElement;
      id = t.jsxMemberExpression(
        // $FlowFixMe Flow error uncovered by typing Babel more strictly
        t.jsxMemberExpression(openingElement.name, t.jsxIdentifier('props')),
        t.jsxIdentifier('children'),
      );
    } else if (isJSXAttribute(grandParentNode)) {
      // <foo bar={function () {}} />
      const openingElement = parentPath?.parentPath?.parentPath?.node;
      const prop = grandParentNode;
      id = t.jsxMemberExpression(
        // $FlowFixMe Flow error uncovered by typing Babel more strictly
        t.jsxMemberExpression(openingElement.name, t.jsxIdentifier('props')),
        // $FlowFixMe Flow error uncovered by typing Babel more strictly
        prop.name,
      );
    }
  }

  // Collapse the name AST, if any, into a string.
  let name = getNameFromId(id);

  if (name == null) {
    // We couldn't find a name directly. Try the parent in certain cases.
    if (isCallExpression(parent) || isNewExpression(parent)) {
      // foo(function () {})
      const argIndex = parent.arguments.indexOf(node);
      if (argIndex !== -1) {
        const calleeName = getNameFromId(parent.callee);
        // var f = Object.freeze(function () {})
        if (CALLEES_TO_SKIP.indexOf(calleeName) !== -1) {
          return getNameForPath(nullthrows(parentPath));
        }
        if (calleeName) {
          return `${calleeName}$argument_${argIndex}`;
        }
      }
    }
    if (isTypeCastExpression(parent) && parent.expression === node) {
      return getNameForPath(nullthrows(parentPath));
    }
    if (isExportDefaultDeclaration(parent)) {
      return 'default';
    }
    // We couldn't infer a name at all.
    return ANONYMOUS_NAME;
  }

  // Annotate getters and setters.
  if (kind) {
    name = kind + '__' + name;
  }

  // Annotate members with the name of their containing object/class.
  if (propertyPath) {
    if (isClassBody(propertyPath.parent)) {
      // $FlowFixMe Disvoered when typing babel-traverse
      const className = getNameForPath(propertyPath.parentPath.parentPath);
      if (className !== ANONYMOUS_NAME) {
        // $FlowFixMe Flow error uncovered by typing Babel more strictly
        const separator = propertyPath.node.static ? '.' : '#';
        name = className + separator + name;
      }
    } else if (isObjectExpression(propertyPath.parent)) {
      // $FlowFixMe[incompatible-use]
      const objectName = getNameForPath(nullthrows(propertyPath.parentPath));
      if (objectName !== ANONYMOUS_NAME) {
        name = objectName + '.' + name;
      }
    }
  }

  return name;
}

function isAnyMemberExpression(node: Node): boolean %checks {
  return (
    node.type === 'MemberExpression' || node.type === 'JSXMemberExpression'
  );
}

function isAnyIdentifier(node: Node): boolean %checks {
  return isIdentifier(node) || isJSXIdentifier(node);
}

function getNameFromId(id: Node): ?string {
  const parts = getNamePartsFromId(id);

  if (!parts.length) {
    return null;
  }
  if (parts.length > 5) {
    return (
      parts[0] +
      '.' +
      parts[1] +
      '...' +
      parts[parts.length - 2] +
      '.' +
      parts[parts.length - 1]
    );
  }
  return parts.join('.');
}

function getNamePartsFromId(id: Node): $ReadOnlyArray<string> {
  if (!id) {
    return [];
  }

  if (isCallExpression(id) || isNewExpression(id)) {
    return getNamePartsFromId(id.callee);
  }

  if (isTypeCastExpression(id)) {
    return getNamePartsFromId(id.expression);
  }

  let name;

  if (isAnyIdentifier(id)) {
    name = id.name;
  } else if (isNullLiteral(id)) {
    name = 'null';
  } else if (isRegExpLiteral(id)) {
    name = `_${id.pattern}_${id.flags ?? ''}`;
  } else if (isTemplateLiteral(id)) {
    name = id.quasis.map(quasi => quasi.value.raw).join('');
  } else if (isLiteral(id) && id.value != null) {
    name = String(id.value);
  }

  if (name != null) {
    return [t.toBindingIdentifierName(name)];
  }

  if (isImport(id)) {
    name = 'import';
  }

  if (name != null) {
    return [name];
  }

  if (isAnyMemberExpression(id)) {
    if (
      isAnyIdentifier(id.object) &&
      id.object.name === 'Symbol' &&
      (isAnyIdentifier(id.property) || isLiteral(id.property))
    ) {
      const propertyName = getNameFromId(id.property);
      if (propertyName) {
        name = '@@' + propertyName;
      }
    } else {
      const propertyName = getNamePartsFromId(id.property);
      if (propertyName.length) {
        const objectName = getNamePartsFromId(id.object);
        if (objectName.length) {
          return [...objectName, ...propertyName];
        } else {
          return propertyName;
        }
      }
    }
  }

  return name ? [name] : [];
}

const DELIMITER_START_RE = /^[^A-Za-z0-9_$@]+/;

/**
 * Strip the given prefix from `name`, if it occurs there, plus any delimiter
 * characters that follow (of which at least one is required). If an empty
 * string would be returned, return the original name instead.
 */
function removeNamePrefix(name: string, namePrefix: string): string {
  if (!namePrefix.length || !name.startsWith(namePrefix)) {
    return name;
  }

  const shortenedName = name.substr(namePrefix.length);
  const [delimiterMatch] = shortenedName.match(DELIMITER_START_RE) || [];
  if (delimiterMatch) {
    return shortenedName.substr(delimiterMatch.length) || name;
  }

  return name;
}

/**
 * Encodes function name mappings as deltas in a Base64 VLQ format inspired by
 * the standard source map format.
 *
 * Mappings on different lines are separated with a single `;` (even if there
 * are multiple intervening lines).
 * Mappings on the same line are separated with `,`.
 *
 * The first mapping of a line has the fields:
 *  [column delta, name delta, line delta]
 *
 * where the column delta is relative to the beginning of the line, the name
 * delta is relative to the previously occurring name, and the line delta is
 * relative to the previously occurring line.
 *
 * The 2...nth other mappings of a line have the fields:
 *  [column delta, name delta]
 *
 * where both fields are relative to their previous running values. The line
 * delta is omitted since it is always 0 by definition.
 *
 * Lines and columns are both 0-based in the serialised format. In memory,
 * lines are 1-based while columns are 0-based.
 */
class MappingEncoder {
  _namesMap: Map<string, number>;
  _names: Array<string>;
  _line: RelativeValue;
  _column: RelativeValue;
  _nameIndex: RelativeValue;
  _mappings: B64Builder;

  constructor() {
    this._namesMap = new Map();
    this._names = [];
    this._line = new RelativeValue(1);
    this._column = new RelativeValue(0);
    this._nameIndex = new RelativeValue(0);
    this._mappings = new B64Builder();
  }

  getResult(): FBSourceFunctionMap {
    return {names: this._names, mappings: this._mappings.toString()};
  }

  push({name, start}: RangeMapping) {
    let nameIndex = this._namesMap.get(name);
    if (typeof nameIndex !== 'number') {
      nameIndex = this._names.length;
      this._names[nameIndex] = name;
      this._namesMap.set(name, nameIndex);
    }
    const lineDelta = this._line.next(start.line);
    const firstOfLine = this._mappings.pos === 0 || lineDelta > 0;
    if (lineDelta > 0) {
      // The next entry will have the line offset, so emit just one semicolon.
      this._mappings.markLines(1);
      this._column.reset(0);
    }
    this._mappings.startSegment(this._column.next(start.column));
    this._mappings.append(this._nameIndex.next(nameIndex));
    if (firstOfLine) {
      this._mappings.append(lineDelta);
    }
  }
}

class RelativeValue {
  _value: number;

  constructor(value: number = 0) {
    this.reset(value);
  }

  next(absoluteValue: number): number {
    const delta = absoluteValue - this._value;
    this._value = absoluteValue;
    return delta;
  }

  reset(value: number = 0) {
    this._value = value;
  }
}

function positionGreater(x, y) {
  return x.line > y.line || (x.line === y.line && x.column > y.column);
}

module.exports = {generateFunctionMap, generateFunctionMappingsArray};
