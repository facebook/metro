/**
 * Copyright (c) 2018-present, Facebook, Inc.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow strict
 * @format
 */

'use strict';

const template = require('@babel/template').default;

import type {Ast} from '@babel/core';
import type {Path} from '@babel/traverse';

type State = {
  importExportImportDefault: Ast,
  importExportImportAll: Ast,
  opts: {inlineableCalls?: Array<string>},
};

/**
 * Produces a Babel template that transforms an "import * as x from ..." or an
 * "import x from ..." call into a "const x = importAll(...)" call with the
 * corresponding id in it.
 */
const importTemplate = template(`
  const LOCAL = IMPORT(FILE);
`);

/**
 * Produces a Babel template that transforms an "import {x as y} from ..." into
 * "const y = require(...).x" call with the corresponding id in it.
 */
const importNamedTemplate = template(`
  const LOCAL = require(FILE).REMOTE;
`);

/**
 * Produces a Babel template that transforms an "import ..." into
 * "require(...)", which is considered a side-effect call.
 */
const importSideEffect = template(`
  require(FILE);
`);

function importExportPlugin() {
  return {
    visitor: {
      ImportDeclaration(path: Path, state: State) {
        if (path.node.importKind && path.node.importKind !== 'value') {
          return;
        }

        const file = path.get('source').node;
        const specifiers = path.get('specifiers');
        const anchor = path.scope.path.get('body.0');

        if (!specifiers.length) {
          anchor.insertBefore(
            importSideEffect({
              FILE: file,
            }),
          );
        } else {
          path.get('specifiers').forEach(s => {
            const imported = s.get('imported').node;
            const local = s.get('local').node;

            switch (s.node.type) {
              case 'ImportNamespaceSpecifier':
                anchor.insertBefore(
                  importTemplate({
                    IMPORT: state.importExportImportAll,
                    FILE: file,
                    LOCAL: local,
                  }),
                );
                break;

              case 'ImportDefaultSpecifier':
                anchor.insertBefore(
                  importTemplate({
                    IMPORT: state.importExportImportDefault,
                    FILE: file,
                    LOCAL: local,
                  }),
                );
                break;

              case 'ImportSpecifier':
                anchor.insertBefore(
                  importNamedTemplate({
                    FILE: file,
                    LOCAL: local,
                    REMOTE: imported,
                  }),
                );
                break;

              default:
                throw new TypeError('Unknown import type: ' + s.node.type);
            }
          });
        }

        path.remove();
      },

      Program(path: Path, state: State) {
        const importExportImportAll = path.scope.generateUidIdentifier(
          '$$_IMPORT_ALL',
        );

        const importExportImportDefault = path.scope.generateUidIdentifier(
          '$$_IMPORT_DEFAULT',
        );

        // Make the inliner aware of the extra calls.
        if (!state.opts.inlineableCalls) {
          state.opts.inlineableCalls = [];
        }

        state.opts.inlineableCalls.push(
          importExportImportAll.name,
          importExportImportDefault.name,
        );

        state.importExportImportDefault = importExportImportDefault;
        state.importExportImportAll = importExportImportAll;
      },
    },
  };
}

module.exports = importExportPlugin;
