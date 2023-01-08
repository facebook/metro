/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow
 * @format
 * @oncall react_native
 */

'use strict';

import type {PluginObj} from '@babel/core';
import type {Binding, NodePath, Scope} from '@babel/traverse';
import type {
  CallExpression,
  Identifier,
  MemberExpression,
  Node,
  ObjectExpression,
} from '@babel/types';
// type only import. No runtime dependency
// eslint-disable-next-line import/no-extraneous-dependencies
import typeof * as Types from '@babel/types';

const createInlinePlatformChecks = require('./utils/createInlinePlatformChecks');

export type Options = {
  dev: boolean,
  inlinePlatform: boolean,
  isWrapped: boolean,
  requireName?: string,
  platform: string,
};

type State = {opts: Options};

const env = {name: 'env'};
const nodeEnv = {name: 'NODE_ENV'};
const processId = {name: 'process'};

const dev = {name: '__DEV__'};

function inlinePlugin(
  {types: t}: {types: Types},
  options: Options,
): PluginObj<State> {
  const {
    isAssignmentExpression,
    isIdentifier,
    isMemberExpression,
    isObjectExpression,
    isObjectMethod,
    isObjectProperty,
    isSpreadElement,
    isStringLiteral,
  } = t;
  const {isPlatformNode, isPlatformSelectNode} = createInlinePlatformChecks(
    t,
    options.requireName || 'require',
  );

  function isGlobal(binding: ?Binding): boolean %checks {
    return !binding;
  }

  const isFlowDeclared = (binding: Binding) =>
    t.isDeclareVariable(binding.path);

  function isGlobalOrFlowDeclared(binding: ?Binding): boolean %checks {
    return isGlobal(binding) || isFlowDeclared(binding);
  }

  const isLeftHandSideOfAssignmentExpression = (
    node: Node,
    parent: Node,
  ): boolean => isAssignmentExpression(parent) && parent.left === node;

  const isProcessEnvNodeEnv = (node: MemberExpression, scope: Scope): boolean =>
    isIdentifier(node.property, nodeEnv) &&
    isMemberExpression(node.object) &&
    isIdentifier(node.object.property, env) &&
    isIdentifier(node.object.object, processId) &&
    isGlobal(scope.getBinding(processId.name));

  const isDev = (node: Identifier, parent: Node, scope: Scope): boolean =>
    isIdentifier(node, dev) &&
    isGlobalOrFlowDeclared(scope.getBinding(dev.name)) &&
    !isMemberExpression(parent) &&
    // not { __DEV__: 'value'}
    (!isObjectProperty(parent) || parent.value === node);

  function findProperty(
    objectExpression: ObjectExpression,
    key: string,
    fallback: () => Node,
  ): Node {
    let value = null;

    for (const p of objectExpression.properties) {
      if (!isObjectProperty(p) && !isObjectMethod(p)) {
        continue;
      }
      if (
        (isIdentifier(p.key) && p.key.name === key) ||
        (isStringLiteral(p.key) && p.key.value === key)
      ) {
        if (isObjectProperty(p)) {
          value = p.value;
          break;
        } else if (isObjectMethod(p)) {
          value = t.toExpression(p);
          break;
        }
      }
    }

    return value ?? fallback();
  }

  function hasStaticProperties(objectExpression: ObjectExpression): boolean {
    return objectExpression.properties.every(p => {
      if (p.computed || isSpreadElement(p)) {
        return false;
      }
      if (isObjectMethod(p) && p.kind !== 'method') {
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
