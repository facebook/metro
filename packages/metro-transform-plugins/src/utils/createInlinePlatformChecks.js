/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow
 * @format
 */

'use strict';

import type {Scope} from '@babel/traverse';
import type {CallExpression, MemberExpression} from '@babel/types';
// Type only import. No runtime dependency
// eslint-disable-next-line import/no-extraneous-dependencies
import typeof * as Types from '@babel/types';

const importMap = new Map([['ReactNative', 'react-native']]);

const RN_BINDING_PATTERNS = [
  {name: 'React'},
  {name: 'ReactNative'},
  // This is the format babel uses when transforming es module imports.
  {name: /^_reactNative[0-9]*$/},
];

type PlatformChecks = {
  isPlatformNode: (
    node: MemberExpression,
    scope: Scope,
    isWrappedModule: boolean,
  ) => boolean,
  isPlatformSelectNode: (
    node: CallExpression,
    scope: Scope,
    isWrappedModule: boolean,
  ) => boolean,
};

function createInlinePlatformChecks(
  t: Types,
  requireName: string = 'require',
): PlatformChecks {
  const {
    isIdentifier,
    isStringLiteral,
    isNumericLiteral,
    isMemberExpression,
    isCallExpression,
  } = t;
  const isPlatformNode = (
    node: MemberExpression,
    scope: Scope,
    isWrappedModule: boolean,
  ): boolean =>
    isPlatformOS(node, scope, isWrappedModule) ||
    isReactPlatformOS(node, scope, isWrappedModule);

  const isPlatformSelectNode = (
    node: CallExpression,
    scope: Scope,
    isWrappedModule: boolean,
  ): boolean =>
    isPlatformSelect(node, scope, isWrappedModule) ||
    isReactPlatformSelect(node, scope, isWrappedModule);

  const isPlatformOS = (
    node: MemberExpression,
    scope,
    isWrappedModule: boolean,
  ): boolean =>
    isIdentifier(node.property, {name: 'OS'}) &&
    isImportOrGlobal(node.object, scope, [{name: 'Platform'}], isWrappedModule);

  const isReactPlatformOS = (node, scope, isWrappedModule: boolean): boolean =>
    isIdentifier(node.property, {name: 'OS'}) &&
    isMemberExpression(node.object) &&
    isIdentifier(node.object.property, {name: 'Platform'}) &&
    isImportOrGlobal(
      node.object.object,
      scope,
      RN_BINDING_PATTERNS,
      isWrappedModule,
    );

  const isPlatformSelect = (node, scope, isWrappedModule: boolean): boolean =>
    isMemberExpression(node.callee) &&
    isIdentifier(node.callee.property, {name: 'select'}) &&
    isImportOrGlobal(
      node.callee.object,
      scope,
      [{name: 'Platform'}],
      isWrappedModule,
    );

  const isReactPlatformSelect = (
    node: CallExpression,
    scope: Scope,
    isWrappedModule: boolean,
  ): boolean =>
    isMemberExpression(node.callee) &&
    isIdentifier(node.callee.property, {name: 'select'}) &&
    isMemberExpression(node.callee.object) &&
    isIdentifier(node.callee.object.property, {name: 'Platform'}) &&
    isImportOrGlobal(
      node.callee.object.object,
      scope,
      RN_BINDING_PATTERNS,
      isWrappedModule,
    );

  const isGlobal = (binding): boolean %checks => !binding;

  const matchIdentifierNamed = (node, pattern: string | RegExp): boolean =>
    isIdentifier(node) &&
    (typeof pattern === 'string'
      ? node.name === pattern
      : pattern.test(node.name));

  const isRequireCall = (node, dependencyId: string, scope): boolean =>
    isCallExpression(node) &&
    isIdentifier(node.callee, {name: requireName}) &&
    checkRequireArgs(node.arguments, dependencyId);

  const isImport = (
    node,
    scope,
    patterns: Array<{|name: string | RegExp|}>,
  ): boolean =>
    patterns.some(pattern => {
      const patternName = pattern.name;
      if (typeof patternName !== 'string') {
        return false;
      }
      const importName = importMap.get(patternName) || patternName;
      return isRequireCall(node, importName, scope);
    });

  const isImportOrGlobal = (
    node,
    scope,
    patterns: Array<{|name: string | RegExp|}>,
    isWrappedModule: boolean,
  ): boolean => {
    const matchesPattern = patterns.some(pattern =>
      matchIdentifierNamed(node, pattern.name),
    );
    return (
      (matchesPattern &&
        isIdentifier(node) &&
        isToplevelBinding(scope.getBinding(node.name), isWrappedModule)) ||
      isImport(node, scope, patterns)
    );
  };

  const checkRequireArgs = (args, dependencyId: string): boolean => {
    const pattern = t.stringLiteral(dependencyId);
    return (
      isStringLiteral(args[0], pattern) ||
      (isMemberExpression(args[0]) &&
        isNumericLiteral(args[0].property) &&
        isStringLiteral(args[1], pattern))
    );
  };

  const isToplevelBinding = (binding, isWrappedModule: boolean): boolean =>
    isGlobal(binding) ||
    !binding.scope.parent ||
    (isWrappedModule && !binding.scope.parent.parent);

  return {
    isPlatformNode,
    isPlatformSelectNode,
  };
}

module.exports = createInlinePlatformChecks;
