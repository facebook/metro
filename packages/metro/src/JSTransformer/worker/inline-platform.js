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

import typeof {types as BabelTypes} from '@babel/core';

const importMap = new Map([['ReactNative', 'react-native']]);

function createInlinePlatformChecks(
  t: BabelTypes,
  requireName: string = 'require',
) {
  const isPlatformNode = (
    node: Object,
    scope: Object,
    isWrappedModule: boolean,
  ) =>
    isPlatformOS(node, scope, isWrappedModule) ||
    isReactPlatformOS(node, scope, isWrappedModule) ||
    isPlatformOSOS(node, scope, isWrappedModule);

  const isPlatformSelectNode = (
    node: Object,
    scope: Object,
    isWrappedModule: boolean,
  ) =>
    isPlatformSelect(node, scope, isWrappedModule) ||
    isReactPlatformSelect(node, scope, isWrappedModule);

  const isPlatformOS = (node, scope, isWrappedModule) =>
    t.isIdentifier(node.property, {name: 'OS'}) &&
    isImportOrGlobal(node.object, scope, [{name: 'Platform'}], isWrappedModule);

  const isReactPlatformOS = (node, scope, isWrappedModule) =>
    t.isIdentifier(node.property, {name: 'OS'}) &&
    t.isMemberExpression(node.object) &&
    t.isIdentifier(node.object.property, {name: 'Platform'}) &&
    isImportOrGlobal(
      node.object.object,
      scope,
      [{name: 'React'}, {name: 'ReactNative'}],
      isWrappedModule,
    );

  const isPlatformOSOS = (node, scope, isWrappedModule) =>
    t.isIdentifier(node.property, {name: 'OS'}) &&
    isImportOrGlobal(
      node.object,
      scope,
      [{name: 'PlatformOS'}],
      isWrappedModule,
    );

  const isPlatformSelect = (node, scope, isWrappedModule) =>
    t.isMemberExpression(node.callee) &&
    t.isIdentifier(node.callee.property, {name: 'select'}) &&
    isImportOrGlobal(
      node.callee.object,
      scope,
      [{name: 'Platform'}],
      isWrappedModule,
    );

  const isReactPlatformSelect = (node, scope, isWrappedModule) =>
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

  const isPlatformOSSelect = (
    node: Object,
    scope: Object,
    isWrappedModule: boolean,
  ) =>
    t.isMemberExpression(node.callee) &&
    t.isIdentifier(node.callee.property, {name: 'select'}) &&
    isImportOrGlobal(
      node.callee.object,
      scope,
      [{name: 'PlatformOS'}],
      isWrappedModule,
    );

  const getReplacementForPlatformOSSelect = (
    node: Object,
    platform: string,
  ) => {
    const matchingProperty = node.arguments[0].properties.find(
      p => p.key.name === platform,
    );

    if (!matchingProperty) {
      throw new Error(
        'No matching property was found for PlatformOS.select:\n' +
          JSON.stringify(node),
      );
    }
    return matchingProperty.value;
  };

  const isGlobal = binding => !binding;

  const isRequireCall = (node, dependencyId, scope) =>
    t.isCallExpression(node) &&
    t.isIdentifier(node.callee, {name: requireName}) &&
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
        isToplevelBinding(
          scope.getBinding(identifier.name),
          isWrappedModule,
        )) ||
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

  return {
    isPlatformNode,
    isPlatformSelectNode,
    isPlatformOSSelect,
    getReplacementForPlatformOSSelect,
  };
}

module.exports = createInlinePlatformChecks;
