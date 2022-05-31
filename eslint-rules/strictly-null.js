/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @format
 */

'use strict';

const messages = {
  WEAK_NULL:
    'Always use `== null` or `!= null` to check for `null` AND `undefined` values (even if you just expect either of them). Within fb we treat them as equal and `== null` checks for both.',
  CHECK_NULL:
    'Use `== null` or `!= null` instead of `undefined` or `void 0` as it checks for both anyways',
};

/**
 * A lint rule to require `null` and `undefined` checks to be `== null` (or !=)
 * Enforces that all `undefined` and `null` checks use `== null` / `!= null`
 */
function rule(context) {
  const sourceCode = context.getSourceCode();

  return {
    BinaryExpression(node) {
      if (node.operator === '===' || node.operator === '!==') {
        if (isTargetedNode(node.left)) {
          reportStrict(
            node,
            node.right,
            sourceCode.getTokenAfter(node.left),
            node.left,
          );
        } else if (isTargetedNode(node.right)) {
          reportStrict(
            node,
            node.left,
            sourceCode.getTokenAfter(node.left),
            node.right,
          );
        }
      } else if (node.operator === '==' || node.operator === '!=') {
        if (isUndefinedNode(node.left) || isVoidNode(node.left)) {
          reportWeak(
            node,
            node.right,
            sourceCode.getTokenAfter(node.left),
            node.left,
          );
        } else if (isUndefinedNode(node.right) || isVoidNode(node.right)) {
          reportWeak(
            node,
            node.left,
            sourceCode.getTokenAfter(node.left),
            node.right,
          );
        }
      }
    },
  };

  function reportStrict(parent, childToKeep, eqToken, childToDitch) {
    context.report({
      node: parent,
      messageId: 'WEAK_NULL',
      fix: createAutofixer(parent, childToKeep, eqToken, childToDitch),
    });
  }
  function reportWeak(parent, childToKeep, eqToken, childToDitch) {
    context.report({
      node: parent,
      messageId: 'CHECK_NULL',
      fix: createAutofixer(parent, childToKeep, eqToken, childToDitch),
    });
  }
  function createAutofixer(parent, childToKeep, eqToken, childToDitch) {
    // If the node was wrapped in a group then that won't show up here
    // so make sure to skip past the group-closing tokens first.
    while (eqToken.value === ')') {
      eqToken = sourceCode.getTokenAfter(eqToken);
    }
    if (
      eqToken.value !== '==' &&
      eqToken.value !== '===' &&
      eqToken.value !== '!=' &&
      eqToken.value !== '!=='
    ) {
      // Unexpected token value. Returning to prevent accidental clobbering.
      return null;
    }
    // Note: make sure `(a||b)===null` does not become `a||b==null` !
    return fixer => [
      fixer.replaceText(
        eqToken,
        eqToken.value === '===' || eqToken.value === '==' ? '==' : '!=',
      ),
      fixer.replaceText(childToDitch, 'null'),
    ];
  }
}

function isTargetedNode(node) {
  return isNullNode(node) || isUndefinedNode(node) || isVoidNode(node);
}
function isNullNode(node) {
  return node.type === 'Literal' && node.value == null;
}
function isUndefinedNode(node) {
  return node.type === 'Identifier' && node.name === 'undefined';
}
function isVoidNode(node) {
  return (
    node.type === 'UnaryExpression' &&
    node.operator === 'void' &&
    node.argument.type === 'Literal' &&
    node.argument.value === 0
  );
}

module.exports = {
  create: rule,
  meta: {
    fixable: 'code',
    messages,
  },
};
