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

import typeof {types as BabelTypes} from 'babel-core';

function constantFoldingPlugin(context: {types: BabelTypes}) {
  const t = context.types;

  const Conditional = {
    exit(path: Object) {
      const node = path.node;
      const test = node.test;
      if (t.isLiteral(test)) {
        if (test.value || node.alternate) {
          path.replaceWith(test.value ? node.consequent : node.alternate);
        } else if (!test.value) {
          path.remove();
        }
      }
    },
  };

  return {
    visitor: {
      BinaryExpression: {
        exit(path: Object) {
          const node = path.node;
          if (t.isLiteral(node.left) && t.isLiteral(node.right)) {
            const result = path.evaluate();
            if (result.confident) {
              path.replaceWith(t.valueToNode(result.value));
            }
          }
        },
      },
      ConditionalExpression: Conditional,
      IfStatement: Conditional,
      LogicalExpression: {
        exit(path: Object) {
          const node = path.node;
          const left = node.left;
          if (t.isLiteral(left)) {
            const value = t.isNullLiteral(left) ? null : left.value;
            if (node.operator === '||') {
              path.replaceWith(value ? left : node.right);
            } else {
              path.replaceWith(value ? node.right : left);
            }
          }
        },
      },
      UnaryExpression: {
        exit(path: Object) {
          const node = path.node;
          if (node.operator === '!' && t.isLiteral(node.argument)) {
            path.replaceWith(t.valueToNode(!node.argument.value));
          }
        },
      },
    },
  };
}

module.exports = constantFoldingPlugin;
