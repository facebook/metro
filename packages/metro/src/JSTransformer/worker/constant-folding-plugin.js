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

import typeof {types as BabelTypes} from '@babel/core';

function constantFoldingPlugin(context: {types: BabelTypes}) {
  const t = context.types;

  const FunctionDeclaration = {
    exit(path: Object) {
      const binding = path.scope.getBinding(path.node.id.name);

      if (binding && !binding.referenced) {
        path.remove();
      }
    },
  };

  const FunctionExpression = {
    exit(path: Object) {
      const parentPath = path.parentPath;

      if (t.isVariableDeclarator(parentPath)) {
        const binding = parentPath.scope.getBinding(parentPath.node.id.name);

        if (binding && !binding.referenced) {
          parentPath.remove();
        }
      }
    },
  };

  const Conditional = {
    exit(path: Object) {
      const node = path.node;
      const result = path.get('test').evaluate();

      if (result.confident) {
        if (result.value || node.alternate) {
          path.replaceWith(result.value ? node.consequent : node.alternate);
        } else if (!result.value) {
          path.remove();
        }
      }
    },
  };

  const Expression = {
    exit(path: Object) {
      const result = path.evaluate();

      if (result.confident) {
        path.replaceWith(t.valueToNode(result.value));
      }
    },
  };

  const LogicalExpression = {
    exit(path: Object) {
      const node = path.node;
      const result = path.get('left').evaluate();

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
    exit(path: Object) {
      path.traverse({
        ArrowFunctionExpression: FunctionExpression,
        FunctionDeclaration,
        FunctionExpression,
      });
    },
  };

  return {
    visitor: {
      BinaryExpression: Expression,
      ConditionalExpression: Conditional,
      IfStatement: Conditional,
      LogicalExpression,
      Program,
      UnaryExpression: Expression,
    },
  };
}

module.exports = constantFoldingPlugin;
