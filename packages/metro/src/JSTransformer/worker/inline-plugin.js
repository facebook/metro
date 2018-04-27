/**
 * Copyright (c) 2016-present, Facebook, Inc.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow
 * @format
 */

'use strict';

const createInlinePlatformChecks = require('./inline-platform');

import typeof {types as BabelTypes} from '@babel/core';
import type {Ast} from 'babel-core';

type Context = {types: BabelTypes};

const env = {name: 'env'};
const nodeEnv = {name: 'NODE_ENV'};
const processId = {name: 'process'};

const dev = {name: '__DEV__'};

function inlinePlugin(context: Context) {
  const t = context.types;

  const {
    isPlatformNode,
    isPlatformSelectNode,
    isPlatformOSSelect,
    getReplacementForPlatformOSSelect,
  } = createInlinePlatformChecks(t);

  const isGlobal = binding => !binding;

  const isFlowDeclared = binding => t.isDeclareVariable(binding.path);

  const isGlobalOrFlowDeclared = binding =>
    isGlobal(binding) || isFlowDeclared(binding);

  const isLeftHandSideOfAssignmentExpression = (node: Ast, parent) =>
    t.isAssignmentExpression(parent) && parent.left === node;

  const isProcessEnvNodeEnv = (node: Ast, scope) =>
    t.isIdentifier(node.property, nodeEnv) &&
    t.isMemberExpression(node.object) &&
    t.isIdentifier(node.object.property, env) &&
    t.isIdentifier(node.object.object, processId) &&
    isGlobal(scope.getBinding(processId.name));

  const isDev = (node: Ast, parent, scope) =>
    t.isIdentifier(node, dev) &&
    isGlobalOrFlowDeclared(scope.getBinding(dev.name)) &&
    !t.isMemberExpression(parent);

  function findProperty(objectExpression, key, fallback) {
    const property = objectExpression.properties.find(p => {
      if (t.isIdentifier(p.key) && p.key.name === key) {
        return true;
      }

      if (t.isStringLiteral(p.key) && p.key.value === key) {
        return true;
      }

      return false;
    });
    return property ? property.value : fallback();
  }

  function hasStaticProperties(objectExpression) {
    if (!t.isObjectExpression(objectExpression)) {
      return false;
    }

    return objectExpression.properties.every(p => {
      if (p.computed) {
        return false;
      }

      return t.isIdentifier(p.key) || t.isStringLiteral(p.key);
    });
  }

  return {
    visitor: {
      Identifier(path: Object, state: Object) {
        if (isDev(path.node, path.parent, path.scope)) {
          path.replaceWith(t.booleanLiteral(state.opts.dev));
        }
      },
      MemberExpression(path: Object, state: Object) {
        const node = path.node;
        const scope = path.scope;
        const opts = state.opts;

        if (!isLeftHandSideOfAssignmentExpression(node, path.parent)) {
          if (isPlatformNode(node, scope, opts.isWrapped)) {
            path.replaceWith(t.stringLiteral(opts.platform));
          } else if (isProcessEnvNodeEnv(node, scope)) {
            path.replaceWith(
              t.stringLiteral(opts.dev ? 'development' : 'production'),
            );
          }
        }
      },
      CallExpression(path: Object, state: Object) {
        const node = path.node;
        const scope = path.scope;
        const arg = node.arguments[0];
        const opts = state.opts;

        if (isPlatformSelectNode(node, scope, opts.isWrapped)) {
          if (hasStaticProperties(arg)) {
            const fallback = () =>
              findProperty(arg, 'default', () => t.identifier('undefined'));

            path.replaceWith(findProperty(arg, opts.platform, fallback));
          }
        } else if (isPlatformOSSelect(node, scope, opts.isWrapped)) {
          path.replaceWith(
            getReplacementForPlatformOSSelect(node, opts.platform),
          );
        }
      },
    },
  };
}

module.exports = inlinePlugin;
