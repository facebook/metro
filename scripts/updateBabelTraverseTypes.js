/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @format
 * @oncall react_native
 */

'use strict';

const virtualTypes = require('@babel/traverse/lib/path/lib/virtual-types');
const t = require('@babel/types');
const fs = require('fs');
const process = require('process');

const NODE_PREFIX = 'BabelNode';
const VISITOR_METHODS_MARKER_NAME = 'VISITOR METHODS';
const NODE_PATH_METHOD_MARKER_NAME = 'NODE PATH METHODS';

const declarationFileName = process.argv[2];

if (declarationFileName == null) {
  throw new Error(
    'Expected the path to the babel-traverse.js library definition as an argument.',
  );
}

if (!fs.existsSync(declarationFileName)) {
  throw new Error(`The file ${declarationFileName} does not exist.`);
}

if (!fs.statSync(declarationFileName).isFile()) {
  throw new Error(`${declarationFileName} is a directory, expected a file.`);
}

let content = fs.readFileSync(declarationFileName).toString('utf-8');

content = replaceGeneratedBlock(
  content,
  VISITOR_METHODS_MARKER_NAME,
  generateVisitorMethods(),
);
content = replaceGeneratedBlock(
  content,
  NODE_PATH_METHOD_MARKER_NAME,
  generateNodePathMethods(),
);

fs.writeFileSync(declarationFileName, content);

function generateVisitorMethods() {
  const uniqueTypes = new Set([
    ...t.TYPES,
    ...Object.keys(t.FLIPPED_ALIAS_KEYS),
  ]);
  const types = [...uniqueTypes].filter(type => {
    if (type === 'File') {
      // The file node can not be visited using a visitor because traverse(node) only visits the
      // children of the passed in node and File has no parent node.
      return false;
    }

    return true;
  });

  types.sort();

  const lines = types.map(type => {
    const nodeType =
      (t.NODE_FIELDS[type] || t.FLIPPED_ALIAS_KEYS[type]) != null ? type : '';
    return `    ${type}?: VisitNode<${NODE_PREFIX}${nodeType}, TState>,`;
  });

  return lines.join('\n');
}

function generateNodePathMethods() {
  const isTypes = [
    ...new Set([
      ...t.TYPES,
      ...Object.keys(virtualTypes).filter(type => !type.startsWith('_')),
    ]),
  ].sort();
  const is = isTypes.map(type => `    is${type}(opts?: Opts): boolean;`);
  const asserts = t.TYPES.map(
    type => `    assert${type}(opts?: Opts): void;`,
  ).sort();

  return `${is.join('\n')}\n${asserts.join('\n')}`;
}

function replaceGeneratedBlock(content, markerName, code) {
  const insertPosition = getGeneratedCodeInsertPosition(content, markerName);
  const prelude = content.substring(0, insertPosition.start);
  const postlude = content.substring(insertPosition.end);

  return `${prelude}\n${code}${postlude}`;
}

function getGeneratedCodeInsertPosition(content, markerName) {
  const beginMarker = `BEGIN GENERATED ${markerName}`;
  const endMarker = `END GENERATED ${markerName}`;

  const beginIndex = content.indexOf(beginMarker);
  const endIndex = content.indexOf(endMarker);

  if (beginIndex === -1) {
    throw new Error(`Did not found ${beginMarker} in the provided file`);
  }

  if (endIndex === -1) {
    throw new Error(`Did not found ${endMarker} in the provided file`);
  }

  return {
    start: beginIndex + beginMarker.length,
    end: content.lastIndexOf('\n', endIndex),
  };
}
