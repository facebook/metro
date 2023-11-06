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
import type {NodePath, VisitNode, Visitor} from '@babel/traverse';
import typeof Traverse from '@babel/traverse';
// This is only a typeof import, no runtime dependency exists
// eslint-disable-next-line import/no-extraneous-dependencies
import typeof * as Types from '@babel/types';

type State = {stripped: boolean};

function constantFoldingPlugin(context: {
  types: Types,
  traverse: Traverse,
  ...
}): PluginObj<State> {
  const t = context.types;
  const {isVariableDeclarator} = t;

  const traverse = context.traverse;

  const evaluate = function (path: NodePath<>): {
    confident: boolean,
    value: mixed,
  } {
    const state = {safe: true};
    const unsafe = (
      path:
        | NodePath<BabelNodeAssignmentExpression>
        | NodePath<BabelNodeCallExpression>,
      state: {safe: boolean},
    ) => {
      state.safe = false;
    };

    path.traverse(
      {
        CallExpression: unsafe,
        AssignmentExpression: unsafe,
      },
      state,
    );

    try {
      if (!state.safe) {
        return {confident: false, value: null};
      }
      const evaluated = path.evaluate();
      return {confident: evaluated.confident, value: evaluated.value};
    } catch {
      return {confident: false, value: null};
    }
  };

  const FunctionDeclaration = {
    exit(path: NodePath<BabelNodeFunctionDeclaration>, state: State): void {
      const binding =
        path.node.id != null && path.scope.parent.getBinding(path.node.id.name);

      if (binding && !binding.referenced) {
        state.stripped = true;
        path.remove();
      }
    },
  };

  const FunctionExpression: VisitNode<
    BabelNodeFunctionExpression | BabelNodeArrowFunctionExpression,
    State,
  > =
    // $FlowFixMe[incompatible-type]
    {
      exit(path, state) {
        const parentPath = path.parentPath;
        const parentNode = parentPath?.node;

        if (isVariableDeclarator(parentNode) && parentNode.id.name != null) {
          const binding = parentPath?.scope.getBinding(parentNode.id.name);

          if (binding && !binding.referenced) {
            state.stripped = true;
            parentPath?.remove();
          }
        }
      },
    };

  const Conditional: VisitNode<
    BabelNodeIfStatement | BabelNodeConditionalExpression,
    State,
  > =
    // $FlowFixMe[incompatible-type]
    {
      exit(path, state): void {
        const node = path.node;
        const result = evaluate(path.get('test'));

        if (result.confident) {
          state.stripped = true;

          if (result.value || node.alternate) {
            // $FlowFixMe Flow error uncovered by typing Babel more strictly
            path.replaceWith(result.value ? node.consequent : node.alternate);
          } else if (!result.value) {
            path.remove();
          }
        }
      },
    };

  const Expression: VisitNode<
    BabelNodeUnaryExpression | BabelNodeBinaryExpression,
    State,
  > =
    // $FlowFixMe[incompatible-type]
    {
      exit(path) {
        const result = evaluate(path);

        if (result.confident) {
          path.replaceWith(t.valueToNode(result.value));
          path.skip();
        }
      },
    };

  const LogicalExpression = {
    exit(path: NodePath<BabelNodeLogicalExpression>) {
      const node = path.node;
      const result = evaluate(path.get('left'));

      if (result.confident) {
        const value = result.value;

        switch (node.operator) {
          case '||':
            path.replaceWith(value ? node.left : node.right);
            break;

          case '&&':
            path.replaceWith(value ? node.right : node.left);
            break;

          case '??':
            path.replaceWith(value == null ? node.right : node.left);
            break;
        }
      }
    },
  };

  const Program = {
    enter(path: NodePath<BabelNodeProgram>, state: State): void {
      state.stripped = false;
    },

    exit(path: NodePath<BabelNodeProgram>, state: State): void {
      path.traverse(
        {
          ArrowFunctionExpression: FunctionExpression,
          ConditionalExpression: Conditional,
          // $FlowFixMe[incompatible-call]
          FunctionDeclaration,
          FunctionExpression,
          IfStatement: Conditional,
        },
        state,
      );

      if (state.stripped) {
        traverse.cache.clearScope();
        path.scope.crawl();

        // Re-traverse all program, if we removed any blocks. Manually re-call
        // enter and exit, because traversing a Program node won't call them.
        Program.enter(path, state);
        path.traverse(visitor, {stripped: false});
        Program.exit(path, state);
      }
    },
  };

  const visitor: Visitor<State> = {
    BinaryExpression: Expression,
    // $FlowFixMe[incompatible-type]
    LogicalExpression,
    Program: {...Program}, // Babel mutates objects passed.
    UnaryExpression: Expression,
  };

  return {visitor};
}

module.exports = constantFoldingPlugin;
