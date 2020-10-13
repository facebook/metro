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

import type {NodePath, Visitor, VisitNode} from '@babel/traverse';
// This is only a typeof import, no runtime dependency exists
// eslint-disable-next-line import/no-extraneous-dependencies
import typeof * as Types from '@babel/types';

type State = {stripped: boolean};
export type Visitors = {|
  visitor: Visitor<State>,
|};

function constantFoldingPlugin(context: {types: Types, ...}): Visitors {
  const t = context.types;
  const {isVariableDeclarator} = t;

  const evaluate = function(
    path: NodePath<>,
  ): {confident: boolean, value: mixed} {
    const state = {safe: true};
    const unsafe = (path, state) => {
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
    exit(path, state): void {
      const binding =
        path.node.id != null && path.scope.getBinding(path.node.id.name);

      if (binding && !binding.referenced) {
        state.stripped = true;
        path.remove();
      }
    },
  };

  const FunctionExpression: VisitNode<
    BabelNodeFunctionExpression | BabelNodeArrowFunctionExpression,
    State,
  > = {
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
  > = {
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
  > = {
    exit(path) {
      const result = evaluate(path);

      if (result.confident) {
        path.replaceWith(t.valueToNode(result.value));
        path.skip();
      }
    },
  };

  const LogicalExpression = {
    exit(path) {
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
    enter(path, state): void {
      state.stripped = false;
    },

    exit(path, state): void {
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
        path.traverse(visitor, {stripped: false});
        Program.exit(path, state);
      }
    },
  };

  const visitor: Visitor<State> = {
    BinaryExpression: Expression,
    LogicalExpression,
    Program: {...Program}, // Babel mutates objects passed.
    UnaryExpression: Expression,
  };

  return {visitor};
}

module.exports = constantFoldingPlugin;
