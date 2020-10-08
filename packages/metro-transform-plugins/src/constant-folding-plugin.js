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

import type {NodePath, Visitor} from '@babel/traverse';
// This is only a typeof import, no runtime dependency exists
// eslint-disable-next-line import/no-extraneous-dependencies
import typeof * as Types from '@babel/types';

export type Visitors = {|
  visitor: Visitor<any>,
|};

function constantFoldingPlugin(context: {types: Types, ...}): Visitors {
  const t = context.types;
  const {isVariableDeclarator} = t;

  const evaluate = function(path: NodePath<>) {
    const state = {safe: true};
    const unsafe = (path: NodePath<>, state: typeof state): void => {
      state.safe = false;
    };

    path.traverse(
      {
        CallExpression: (
          path: NodePath<BabelNodeCallExpression>,
          state,
        ): void => unsafe(path, state),
        AssignmentExpression: (
          path: NodePath<BabelNodeAssignmentExpression>,
          state,
        ): void => unsafe(path, state),
      },
      state,
    );

    try {
      return state.safe ? path.evaluate() : {confident: false, value: null};
    } catch (err) {
      return {confident: false, value: null};
    }
  };

  const FunctionDeclaration = {
    exit(path: NodePath<BabelNodeFunctionDeclaration>, state: Object): void {
      const binding =
        path.node.id != null && path.scope.getBinding(path.node.id.name);

      if (binding && !binding.referenced) {
        state.stripped = true;
        path.remove();
      }
    },
  };

  const FunctionExpression = {
    exit(
      path: NodePath<
        BabelNodeFunctionExpression | BabelNodeArrowFunctionExpression,
      >,
      state: Object,
    ): void {
      const parentPath = path.parentPath;
      const parentNode = parentPath.node;

      if (isVariableDeclarator(parentNode) && parentNode.id.name != null) {
        const binding = parentPath.scope.getBinding(parentNode.id.name);

        if (binding && !binding.referenced) {
          state.stripped = true;
          parentPath.remove();
        }
      }
    },
  };

  const Conditional = {
    exit(path: NodePath<BabelNodeConditional>, state: Object): void {
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

  const Expression = {
    exit(
      path: NodePath<BabelNodeBinaryExpression | BabelNodeUnaryExpression>,
    ): void {
      const result = evaluate(path);

      if (result.confident) {
        path.replaceWith(t.valueToNode(result.value));
        path.skip();
      }
    },
  };

  const LogicalExpression = {
    exit(path: NodePath<BabelNodeLogicalExpression>): void {
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
    enter(path: NodePath<BabelNodeProgram>, state: Object): void {
      state.stripped = false;
    },

    exit(path: NodePath<BabelNodeProgram>, state: Object): void {
      path.traverse(
        {
          ArrowFunctionExpression: FunctionExpression,
          ConditionalExpression: Conditional,
          FunctionDeclaration,
          FunctionExpression,
          IfStatement: Conditional,
        },
        state,
      );

      if (state.stripped) {
        path.scope.crawl();

        // Re-traverse all program, if we removed any blocks. Manually re-call
        // enter and exit, because traversing a Program node won't call them.
        Program.enter(path, state);
        path.traverse(visitor);
        Program.exit(path, state);
      }
    },
  };

  const visitor = {
    BinaryExpression: {
      exit: (expr: NodePath<BabelNodeBinaryExpression>) => {
        return Expression.exit(expr);
      },
    },
    LogicalExpression,
    Program: {...Program}, // Babel mutates objects passed.
    UnaryExpression: {
      exit: (expr: NodePath<BabelNodeUnaryExpression>) => {
        return Expression.exit(expr);
      },
    },
  };

  return {visitor};
}

module.exports = constantFoldingPlugin;
