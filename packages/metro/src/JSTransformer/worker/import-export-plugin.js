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

const template = require('@babel/template').default;

import type {Ast} from '@babel/core';
import type {Path} from '@babel/traverse';

type State = {
  importDefault: Ast,
  importAll: Ast,

  opts: {
    importDefault: string,
    importAll: string,
  },
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

const exportAllTemplate = template(`
  const REQUIRE = require(FILE);

  for (const key in REQUIRE) {
    exports[key] = REQUIRE[key];
  }
`);

const exportTemplate = template(`
  exports.REMOTE = LOCAL;
`);

// eslint-disable-next-line lint/flow-no-fixme
function importExportPlugin({types: t}: $FlowFixMe) {
  const exportAll: Array<{file: string}> = [];
  const exportDefault: Array<{local: string}> = [];
  const exportNamed: Array<{local: string, remote: string}> = [];

  return {
    visitor: {
      ExportAllDeclaration(path: Path, state: State) {
        if (path.node.exportKind && path.node.exportKind !== 'value') {
          return;
        }

        exportAll.push({
          file: path.get('source').node.value,
        });

        path.remove();
      },

      ExportDefaultDeclaration(path: Path, state: State) {
        if (path.node.exportKind && path.node.exportKind !== 'value') {
          return;
        }

        const declaration = path.get('declaration');
        const node = declaration.node;
        const id = node.id || path.scope.generateUidIdentifier('default');

        node.id = id;

        exportDefault.push({
          local: id.name,
        });

        if (t.isDeclaration(declaration)) {
          path.insertBefore(node);
        } else {
          path.insertBefore(
            t.variableDeclaration('var', [t.variableDeclarator(id, node)]),
          );
        }

        path.remove();
      },

      ExportNamedDeclaration(path: Path, state: State) {
        if (path.node.exportKind && path.node.exportKind !== 'value') {
          return;
        }

        const declaration = path.get('declaration');
        const specifiers = path.get('specifiers');

        if (declaration.node) {
          if (t.isVariableDeclaration(declaration)) {
            declaration.get('declarations').forEach(d => {
              const name = d.get('id').node.name;

              exportNamed.push({local: name, remote: name});
            });
          } else {
            const id =
              declaration.node.id || path.scope.generateUidIdentifier();
            const name = id.name;

            declaration.node.id = id;
            exportNamed.push({local: name, remote: name});
          }

          path.insertBefore(declaration.node);
        }

        if (specifiers) {
          specifiers.forEach(s => {
            const local = s.node.local;
            const remote = s.node.exported;

            if (path.node.source) {
              const temp = path.scope.generateUidIdentifier(local.name);

              if (local.name === 'default') {
                path.insertBefore(
                  importTemplate({
                    FILE: path.node.source,
                    LOCAL: temp,
                  }),
                );

                exportNamed.push({local: temp.name, remote: remote.name});
              } else if (remote.name === 'default') {
                path.insertBefore(
                  importNamedTemplate({
                    FILE: path.node.source,
                    LOCAL: temp,
                    REMOTE: local,
                  }),
                );

                exportDefault.push({local: temp.name});
              } else {
                path.insertBefore(
                  importNamedTemplate({
                    FILE: path.node.source,
                    LOCAL: temp,
                    REMOTE: local,
                  }),
                );

                exportNamed.push({local: temp.name, remote: remote.name});
              }
            } else {
              if (remote.name === 'default') {
                exportDefault.push({local: local.name});
              } else {
                exportNamed.push({local: local.name, remote: remote.name});
              }
            }
          });
        }

        path.remove();
      },

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
                    IMPORT: state.importAll,
                    FILE: file,
                    LOCAL: local,
                  }),
                );
                break;

              case 'ImportDefaultSpecifier':
                anchor.insertBefore(
                  importTemplate({
                    IMPORT: state.importDefault,
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

      Program: {
        enter(path: Path, state: State) {
          state.importAll = t.identifier(state.opts.importAll);
          state.importDefault = t.identifier(state.opts.importDefault);
        },

        exit(path: Path, state: State) {
          const body = path.node.body;

          exportDefault.forEach(e => {
            body.push(
              exportTemplate({
                LOCAL: t.identifier(e.local),
                REMOTE: t.identifier('default'),
              }),
            );
          });

          exportAll.forEach(e => {
            body.push(
              ...exportAllTemplate({
                FILE: t.stringLiteral(e.file),
                REQUIRE: path.scope.generateUidIdentifier(e.file),
              }),
            );
          });

          exportNamed.forEach(e => {
            body.push(
              exportTemplate({
                LOCAL: t.identifier(e.local),
                REMOTE: t.identifier(e.remote),
              }),
            );
          });

          if (exportDefault.length || exportAll.length || exportNamed.length) {
            body.unshift(
              exportTemplate({
                LOCAL: t.booleanLiteral(true),
                REMOTE: t.identifier('__esModule'),
              }),
            );
          }
        },
      },
    },
  };
}

module.exports = importExportPlugin;
