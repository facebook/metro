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

import type {Ast} from '@babel/core';
import type {Path} from '@babel/traverse';

function normalizePseudoglobals(ast: Ast): $ReadOnlyArray<string> {
  let pseudoglobals = [];
  const reserved = [];
  let params = null;
  let body = null;

  traverse(ast, {
    Program: {
      enter(path: Path) {
        params = path.get('body.0.expression.arguments.0.params');
        body = path.get('body.0.expression.arguments.0.body');

        if (!body || !(params instanceof Array)) {
          params = null;
          body = null;

          return;
        }

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

      exit(path: Path) {
        reserved.forEach((shortName, i) => {
          if (pseudoglobals[i] && shortName && body && params) {
            body.scope.rename(pseudoglobals[i], shortName);
          }
        });
      },
    },

    Scope(path: Path) {
      path.scope.crawl();

      if (body && params && path.node !== body.node) {
        reserved.forEach((shortName, i) => {
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
