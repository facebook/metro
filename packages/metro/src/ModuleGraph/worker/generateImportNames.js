/**
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @format
 * @flow
 */

'use strict';

const nullthrows = require('nullthrows');
const traverse = require('@babel/traverse').default;

import type {Ast} from '@babel/core';

/**
 * Select unused names for "metroImportDefault" and "metroImportAll", by
 * calling "generateUid".
 */
function generateImportNames(
  ast: Ast,
): {importAll: string, importDefault: string} {
  let importDefault;
  let importAll;

  traverse(ast, {
    Program(path) {
      importAll = path.scope.generateUid('$$_IMPORT_ALL');
      importDefault = path.scope.generateUid('$$_IMPORT_DEFAULT');
    },
  });

  return {
    importAll: nullthrows(importAll),
    importDefault: nullthrows(importDefault),
  };
}

module.exports = generateImportNames;
