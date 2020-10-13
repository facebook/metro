/**
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow strict
 * @format
 */

'use strict';

const traverse = require('@babel/traverse').default;

import type {NodePath} from '@babel/traverse';
import type {Program} from '@babel/types';

function normalizePseudoglobals(ast: BabelNode): $ReadOnlyArray<string> {
  let pseudoglobals: Array<string> = [];
  const reserved = [];
  let params = null;
  let body: ?NodePath<> = null;

  traverse(ast, {
    Program: {
      enter(path: NodePath<Program>): void {
        params = path.get('body.0.expression.arguments.0.params');
        const bodyPath = path.get('body.0.expression.arguments.0.body');

        if (!bodyPath || Array.isArray(bodyPath) || !Array.isArray(params)) {
          params = null;
          body = null;

          return;
        } else {
          body = bodyPath;
        }

        // $FlowFixMe Flow error uncovered by typing Babel more strictly
        pseudoglobals = params.map(path => path.node.name);

        for (let i = 0; i < pseudoglobals.length; i++) {
          // Try finding letters that are semantically relatable to the name
          // of the variable given. For instance, in XMLHttpRequest, it will
          // first match "X", then "H", then "R".
          const regexp = /^[^A-Za-z]*([A-Za-z])|([A-Z])[a-z]|([A-Z])[A-Z]+$/g;
          let match;

          while ((match = regexp.exec(pseudoglobals[i]))) {
            const name = (match[1] || match[2] || match[3] || '').toLowerCase();

            if (!name) {
              throw new ReferenceError(
                'Could not identify any valid name for ' + pseudoglobals[i],
              );
            }

            if (reserved.indexOf(name) === -1) {
              reserved[i] = name;
              break;
            }
          }
        }

        if (new Set(reserved).size !== pseudoglobals.length) {
          throw new ReferenceError(
            'Shortened variables are not unique: ' + reserved.join(', '),
          );
        }
      },

      exit(path: NodePath<>): void {
        reserved.forEach((shortName: string, i: number) => {
          if (pseudoglobals[i] && shortName && body && params) {
            body.scope.rename(pseudoglobals[i], shortName);
          }
        });
      },
    },

    Scope(path: NodePath<>): void {
      path.scope.crawl();

      if (body && params && path.node !== body.node) {
        reserved.forEach((shortName: string, i: number) => {
          if (pseudoglobals[i] && shortName) {
            path.scope.rename(shortName, path.scope.generateUid(shortName));
          }
        });
      }
    },
  });

  return reserved;
}

module.exports = normalizePseudoglobals;
