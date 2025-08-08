/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @format
 * @flow
 */

/*::
// $FlowExpectedError[untyped-type-import] - eslint not typed in OSS
import type {RuleModule, SuggestionReportDescriptor} from 'eslint';
import type {ESNode} from 'hermes-estree';
import type {
  DestructuringObjectProperty,
  DestructuringObjectPropertyWithNonShorthandStaticName,
} from 'hermes-estree/dist';
*/

'use strict';

module.exports = {
  meta: {
    type: 'problem',
    docs: {
      description: 'Disallow CommonJS `require()` syntax',
    },
    messages: {
      COMMONJS_REQUIRE: 'Use ESM imports in this part of the codebase.',
    },
    schema: [],
    fixable: 'code',
  },

  create(context) {
    function isModuleScope(from /*: ESNode */, name /*: string */) {
      let scope = context.sourceCode.getScope(from);
      while (scope?.upper) {
        if (scope.variables.find(variable => variable.name === name)) {
          return false;
        }
        scope = scope.upper;
      }
      return true;
    }

    return {
      CallExpression(node) {
        if (
          node.callee.type === 'Identifier' &&
          node.callee.name === 'require' &&
          isModuleScope(node, 'require') &&
          node.arguments.length === 1 &&
          node.arguments[0].type === 'Literal'
        ) {
          // $FlowExpectedError[value-as-type] - eslint not typed in OSS
          let fixer /*: SuggestionReportDescriptor['fix'] */ = null;
          if (context.sourceCode.getScope(node)?.type === 'module') {
            if (node.parent.type === 'ExpressionStatement') {
              fixer = fixer => {
                return fixer.replaceText(
                  node,
                  `import ${context.getSourceCode().getText(node.arguments[0])}`,
                );
              };
            } else if (
              node.parent?.type === 'VariableDeclarator' &&
              node.parent?.parent?.type === 'VariableDeclaration' &&
              node.parent.parent.kind === 'const'
            ) {
              const id = node.parent.id;
              const declaration = node.parent.parent;
              if (id.type === 'Identifier') {
                fixer = fixer => {
                  return fixer.replaceText(
                    declaration,
                    `import ${id.name} from ${context.sourceCode.getText(node.arguments[0])};`,
                  );
                };
              } else if (id.type === 'ObjectPattern') {
                const names = id.properties
                  .filter(
                    prop => prop.type === 'Property' && prop.computed === false,
                  )
                  .map(prop => {
                    if (prop.key.type !== 'Identifier') {
                      return null;
                    }
                    if (prop.shorthand) {
                      return {
                        key: prop.key.name,
                        local: prop.key.name,
                      };
                    } else {
                      // Don't deal with deep destructuring, etc
                      if (prop.value.type !== 'Identifier') {
                        return null;
                      }
                      return {
                        key: prop.key.name,
                        local: prop.value.name,
                      };
                    }
                  })
                  .filter(Boolean);
                if (names.length === id.properties.length) {
                  // If the properties are all identifiers, we can convert to named imports
                  // e.g. `const {foo, bar} = require('foo');` ->
                  // `import {foo, bar} from 'foo';`
                  fixer = fixer => {
                    return fixer.replaceText(
                      declaration,
                      `import {${names.map(({key, local}) => (key === local ? key : `${key} as ${local}`)).join(', ')}} from ${context.sourceCode.getText(node.arguments[0])};`,
                    );
                  };
                }
              } else {
                fixer = null;
              }
            }
          }
          context.report({
            node,
            messageId: 'COMMONJS_REQUIRE',
            fix: fixer,
          });
        }
      },
    };
  },
} /*:: as RuleModule */;
