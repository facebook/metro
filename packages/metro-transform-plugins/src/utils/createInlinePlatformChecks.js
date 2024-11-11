/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow strict
 * @format
 * @oncall react_native
 */

'use strict';

import type {Scope} from '@babel/traverse';
import type {CallExpression, MemberExpression} from '@babel/types';
// Type only import. No runtime dependency
// eslint-disable-next-line import/no-extraneous-dependencies
import typeof * as Types from '@babel/types';

const importMap = new Map([['ReactNative', 'react-native']]);

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
    scope: Scope,
    isWrappedModule: boolean,
  ): boolean =>
    isIdentifier(node.property, {name: 'OS'}) &&
    isImportOrGlobal(node.object, scope, [{name: 'Platform'}], isWrappedModule);

  const isReactPlatformOS = (
    node: MemberExpression,
    scope: Scope,
    isWrappedModule: boolean,
  ): boolean =>
    isIdentifier(node.property, {name: 'OS'}) &&
    isMemberExpression(node.object) &&
    isIdentifier(node.object.property, {name: 'Platform'}) &&
    isImportOrGlobal(
      // $FlowFixMe[incompatible-call]
      node.object.object,
      scope,
      [{name: 'React'}, {name: 'ReactNative'}],
      isWrappedModule,
    );

  const isPlatformSelect = (
    node: CallExpression,
    scope: Scope,
    isWrappedModule: boolean,
  ): boolean =>
    isMemberExpression(node.callee) &&
    isIdentifier(node.callee.property, {name: 'select'}) &&
    isImportOrGlobal(
      // $FlowFixMe[incompatible-call]
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
      // $FlowFixMe[incompatible-call]
      // $FlowFixMe[incompatible-use]
      node.callee.object.object,
      scope,
      [{name: 'React'}, {name: 'ReactNative'}],
      isWrappedModule,
    );

  const isRequireCall = (
    node: BabelNodeExpression,
    dependencyId: string,
    scope: Scope,
  ): boolean =>
    isCallExpression(node) &&
    isIdentifier(node.callee, {name: requireName}) &&
    checkRequireArgs(node.arguments, dependencyId);

  const isImport = (
    node: BabelNodeExpression,
    scope: Scope,
    patterns: Array<{name: string}>,
  ): boolean =>
    patterns.some((pattern: {name: string}) => {
      const importName = importMap.get(pattern.name) || pattern.name;
      return isRequireCall(node, importName, scope);
    });

  const isImportOrGlobal = (
    node: BabelNodeExpression,
    scope: Scope,
    patterns: Array<{name: string}>,
    isWrappedModule: boolean,
  ): boolean => {
    const identifier = patterns.find((pattern: {name: string}) =>
      isIdentifier(node, pattern),
    );
    return (
      (!!identifier &&
        isToplevelBinding(
          scope.getBinding(identifier.name),
          isWrappedModule,
        )) ||
      isImport(node, scope, patterns)
    );
  };

  const checkRequireArgs = (
    args: Array<
      | BabelNodeExpression
      | BabelNodeSpreadElement
      | BabelNodeArgumentPlaceholder,
    >,
    dependencyId: string,
  ): boolean => {
    const pattern = t.stringLiteral(dependencyId);
    return (
      isStringLiteral(args[0], pattern) ||
      (isMemberExpression(args[0]) &&
        isNumericLiteral(args[0].property) &&
        isStringLiteral(args[1], pattern))
    );
  };

  const isToplevelBinding = (
    binding: void | $FlowFixMe,
    isWrappedModule: boolean,
  ): boolean =>
    !binding ||
    !binding.scope.parent ||
    (isWrappedModule && !binding.scope.parent.parent);

  return {
    isPlatformNode,
    isPlatformSelectNode,
  };
}

module.exports = createInlinePlatformChecks;
