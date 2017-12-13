/**
 * Copyright (c) 2016-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 *
 * @flow
 * @format
 */

'use strict';

const babel = require('babel-core');

const t = babel.types;
const importMap = new Map([['ReactNative', 'react-native']]);

const isPlatformOS = (node: any, scope: any, isWrappedModule: boolean) =>
  t.isIdentifier(node.property, {name: 'OS'}) &&
  isImportOrGlobal(node.object, scope, [{name: 'Platform'}], isWrappedModule);

const isReactPlatformOS = (node: any, scope: any, isWrappedModule: boolean) =>
  t.isIdentifier(node.property, {name: 'OS'}) &&
  t.isMemberExpression(node.object) &&
  t.isIdentifier(node.object.property, {name: 'Platform'}) &&
  isImportOrGlobal(
    node.object.object,
    scope,
    [{name: 'React'}, {name: 'ReactNative'}],
    isWrappedModule,
  );

const isPlatformSelect = (node: any, scope: any, isWrappedModule: boolean) =>
  t.isMemberExpression(node.callee) &&
  t.isIdentifier(node.callee.object, {name: 'Platform'}) &&
  t.isIdentifier(node.callee.property, {name: 'select'}) &&
  isImportOrGlobal(
    node.callee.object,
    scope,
    [{name: 'Platform'}],
    isWrappedModule,
  );

const isReactPlatformSelect = (
  node: any,
  scope: any,
  isWrappedModule: boolean,
) =>
  t.isMemberExpression(node.callee) &&
  t.isIdentifier(node.callee.property, {name: 'select'}) &&
  t.isMemberExpression(node.callee.object) &&
  t.isIdentifier(node.callee.object.property, {name: 'Platform'}) &&
  isImportOrGlobal(
    node.callee.object.object,
    scope,
    [{name: 'React'}, {name: 'ReactNative'}],
    isWrappedModule,
  );

const isGlobal = binding => !binding;

const isRequireCall = (node, dependencyId, scope) =>
  t.isCallExpression(node) &&
  t.isIdentifier(node.callee, {name: 'require'}) &&
  checkRequireArgs(node.arguments, dependencyId);

const isImport = (node, scope, patterns) =>
  patterns.some(pattern => {
    const importName = importMap.get(pattern.name) || pattern.name;
    return isRequireCall(node, importName, scope);
  });

const isImportOrGlobal = (node, scope, patterns, isWrappedModule) => {
  const identifier = patterns.find(pattern => t.isIdentifier(node, pattern));
  return (
    (identifier &&
      isToplevelBinding(scope.getBinding(identifier.name), isWrappedModule)) ||
    isImport(node, scope, patterns)
  );
};

const checkRequireArgs = (args, dependencyId) => {
  const pattern = t.stringLiteral(dependencyId);
  return (
    t.isStringLiteral(args[0], pattern) ||
    (t.isMemberExpression(args[0]) &&
      t.isNumericLiteral(args[0].property) &&
      t.isStringLiteral(args[1], pattern))
  );
};

const isToplevelBinding = (binding, isWrappedModule) =>
  isGlobal(binding) ||
  !binding.scope.parent ||
  (isWrappedModule && !binding.scope.parent.parent);

module.exports = {
  isPlatformOS,
  isReactPlatformOS,
  isPlatformSelect,
  isReactPlatformSelect,
};
