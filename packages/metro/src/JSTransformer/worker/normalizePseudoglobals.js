/**
 * Copyright (c) 2018-present, Facebook, Inc.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @format
 * @flow strict
 */

'use strict';

const traverse = require('@babel/traverse').default;

import type {Ast} from '@babel/core';

function normalizePseudoglobals(ast: Ast): $ReadOnlyArray<string> {
  let pseudoglobals = [];
  let reserved = [];
  let params = null;
  let body = null;

  traverse(ast, {
    Program: {
      enter(path, state) {
        params = path.get('body.0.expression.arguments.0.params');
        body = path.get('body.0.expression.arguments.0.body');

        if (!body || !(params instanceof Array)) {
          params = null;
          body = null;

          return;
        }

        pseudoglobals = params.map(path => path.node.name);
        reserved = pseudoglobals.map(name => {
          return (name.match(/[a-z]/i) || [''])[0].toLowerCase();
        });
      },

      exit(path, state) {
        reserved.forEach((shortName, i) => {
          if (pseudoglobals[i] && shortName && body && params) {
            body.scope.rename(pseudoglobals[i], shortName);
          }
        });
      },
    },

    Scope(path, state) {
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
