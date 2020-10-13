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

const createInlinePlatformChecks = require('./utils/createInlinePlatformChecks');

import type {NodePath} from '@babel/traverse';
// type only import. No runtime dependency
// eslint-disable-next-line import/no-extraneous-dependencies
import typeof * as Types from '@babel/types';
import type {
  Node,
  CallExpression,
  Identifier,
  MemberExpression,
  ObjectExpression,
} from '@babel/types';

export type Options = {
  dev: boolean,
  inlinePlatform: boolean,
  isWrapped: boolean,
  requireName?: string,
  platform: string,
  ...
};

type State = {opts: Options, ...};

export type Visitors = {|
  visitor: {|
    CallExpression: (path: NodePath<CallExpression>, state: State) => void,
    Identifier: (path: NodePath<Identifier>, state: State) => void,
    MemberExpression: (path: NodePath<MemberExpression>, state: State) => void,
  |},
|};

const env = {name: 'env'};
const nodeEnv = {name: 'NODE_ENV'};
const processId = {name: 'process'};

const dev = {name: '__DEV__'};

function inlinePlugin(
  {types: t}: {types: Types, ...},
  options: Options,
): Visitors {
  const {
    isAssignmentExpression,
    isIdentifier,
    isStringLiteral,
    isMemberExpression,
    isObjectProperty,
    isSpreadElement,
    isObjectExpression,
  } = t;
  const {isPlatformNode, isPlatformSelectNode} = createInlinePlatformChecks(
    t,
    options.requireName || 'require',
  );

  const isGlobal = (binding): boolean %checks => !binding;

  const isFlowDeclared = binding => t.isDeclareVariable(binding.path);

  const isGlobalOrFlowDeclared = (binding): boolean %checks =>
    isGlobal(binding) || isFlowDeclared(binding);

  const isLeftHandSideOfAssignmentExpression = (node: Node, parent: Node) =>
    isAssignmentExpression(parent) && parent.left === node;

  const isProcessEnvNodeEnv = (node: MemberExpression, scope) =>
    isIdentifier(node.property, nodeEnv) &&
    isMemberExpression(node.object) &&
    isIdentifier(node.object.property, env) &&
    isIdentifier(node.object.object, processId) &&
    isGlobal(scope.getBinding(processId.name));

  const isDev = (node: Identifier, parent: Node, scope) =>
    isIdentifier(node, dev) &&
    isGlobalOrFlowDeclared(scope.getBinding(dev.name)) &&
    !isMemberExpression(parent) &&
    // not { __DEV__: 'value'}
    (!isObjectProperty(parent) || parent.value === node);

  function findProperty(
    objectExpression: ObjectExpression,
    key: string,
    fallback,
  ) {
    let value = null;

    for (const p of objectExpression.properties) {
      if (!isObjectProperty(p)) {
        continue;
      }

      if (
        (isIdentifier(p.key) && p.key.name === key) ||
        (isStringLiteral(p.key) && p.key.value === key)
      ) {
        value = p.value;
        break;
      }
    }

    return value ?? fallback();
  }

  function hasStaticProperties(objectExpression: ObjectExpression): boolean {
    return objectExpression.properties.every(p => {
      if (p.computed || isSpreadElement(p)) {
        return false;
      }

      return isIdentifier(p.key) || isStringLiteral(p.key);
    });
  }

  return {
    visitor: {
      Identifier(path: NodePath<Identifier>, state: State): void {
        if (!state.opts.dev && isDev(path.node, path.parent, path.scope)) {
          path.replaceWith(t.booleanLiteral(state.opts.dev));
        }
      },
      MemberExpression(path: NodePath<MemberExpression>, state: State): void {
        const node = path.node;
        const scope = path.scope;
        const opts = state.opts;

        if (!isLeftHandSideOfAssignmentExpression(node, path.parent)) {
          if (
            opts.inlinePlatform &&
            isPlatformNode(node, scope, !!opts.isWrapped)
          ) {
            path.replaceWith(t.stringLiteral(opts.platform));
          } else if (!opts.dev && isProcessEnvNodeEnv(node, scope)) {
            path.replaceWith(
              t.stringLiteral(opts.dev ? 'development' : 'production'),
            );
          }
        }
      },
      CallExpression(path: NodePath<CallExpression>, state: State): void {
        const node = path.node;
        const scope = path.scope;
        const arg = node.arguments[0];
        const opts = state.opts;

        if (
          opts.inlinePlatform &&
          isPlatformSelectNode(node, scope, !!opts.isWrapped) &&
          isObjectExpression(arg)
        ) {
          if (hasStaticProperties(arg)) {
            const fallback = () =>
              findProperty(arg, 'native', () =>
                findProperty(arg, 'default', () => t.identifier('undefined')),
              );

            path.replaceWith(findProperty(arg, opts.platform, fallback));
          }
        }
      },
    },
  };
}

module.exports = inlinePlugin;
