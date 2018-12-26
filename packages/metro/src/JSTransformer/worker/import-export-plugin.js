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
  exportAll: Array<{file: string}>,
  exportDefault: Array<{local: string}>,
  exportNamed: Array<{local: string, remote: string}>,

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
  var LOCAL = IMPORT(FILE);
`);

/**
 * Produces a Babel template that transforms an "import {x as y} from ..." into
 * "const y = require(...).x" call with the corresponding id in it.
 */
const importNamedTemplate = template(`
  var LOCAL = require(FILE).REMOTE;
`);

/**
 * Produces a Babel template that transforms an "import ..." into
 * "require(...)", which is considered a side-effect call.
 */
const importSideEffect = template(`
  require(FILE);
`);

/**
 * Produces an "export all" template that traverses all exported symbols and
 * re-exposes them.
 */
const exportAllTemplate = template(`
  var REQUIRED = require(FILE);

  for (var KEY in REQUIRED) {
    exports[KEY] = REQUIRED[KEY];
  }
`);

/**
 * Produces a "named export" or "default export" template to export a single
 * symbol.
 */
const exportTemplate = template(`
  exports.REMOTE = LOCAL;
`);

/**
 * Flags the exported module as a transpiled ES module. Needs to be kept in 1:1
 * compatibility with Babel.
 */
const esModuleExport = template(`
  Object.defineProperty(exports, '__esModule', {value: true});
`);

// eslint-disable-next-line lint/flow-no-fixme
function importExportPlugin({types: t}: $FlowFixMe) {
  return {
    visitor: {
      ExportAllDeclaration(path: Path, state: State) {
        if (path.node.exportKind && path.node.exportKind !== 'value') {
          return;
        }

        state.exportAll.push({
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

        state.exportDefault.push({
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
              switch (d.get('id').node.type) {
                case 'ObjectPattern':
                  {
                    const properties = d.get('id').get('properties');
                    properties.forEach(p => {
                      const name = p.get('key').node.name;
                      state.exportNamed.push({local: name, remote: name});
                    });
                  }
                  break;
                case 'ArrayPattern':
                  {
                    const elements = d.get('id').get('elements');
                    elements.forEach(e => {
                      const name = e.node.name;
                      state.exportNamed.push({local: name, remote: name});
                    });
                  }
                  break;
                default:
                  {
                    const name = d.get('id').node.name;
                    state.exportNamed.push({local: name, remote: name});
                  }
                  break;
              }
            });
          } else {
            const id =
              declaration.node.id || path.scope.generateUidIdentifier();
            const name = id.name;

            declaration.node.id = id;
            state.exportNamed.push({local: name, remote: name});
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
                    IMPORT: state.importDefault,
                    FILE: path.node.source,
                    LOCAL: temp,
                  }),
                );

                state.exportNamed.push({local: temp.name, remote: remote.name});
              } else if (remote.name === 'default') {
                path.insertBefore(
                  importNamedTemplate({
                    FILE: path.node.source,
                    LOCAL: temp,
                    REMOTE: local,
                  }),
                );

                state.exportDefault.push({local: temp.name});
              } else {
                path.insertBefore(
                  importNamedTemplate({
                    FILE: path.node.source,
                    LOCAL: temp,
                    REMOTE: local,
                  }),
                );

                state.exportNamed.push({local: temp.name, remote: remote.name});
              }
            } else {
              if (remote.name === 'default') {
                state.exportDefault.push({local: local.name});
              } else {
                state.exportNamed.push({
                  local: local.name,
                  remote: remote.name,
                });
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
          state.exportAll = [];
          state.exportDefault = [];
          state.exportNamed = [];

          state.importAll = t.identifier(state.opts.importAll);
          state.importDefault = t.identifier(state.opts.importDefault);
        },

        exit(path: Path, state: State) {
          const body = path.node.body;

          state.exportDefault.forEach(e => {
            body.push(
              exportTemplate({
                LOCAL: t.identifier(e.local),
                REMOTE: t.identifier('default'),
              }),
            );
          });

          state.exportAll.forEach(e => {
            body.push(
              ...exportAllTemplate({
                FILE: t.stringLiteral(e.file),
                REQUIRED: path.scope.generateUidIdentifier(e.file),
                KEY: path.scope.generateUidIdentifier('key'),
              }),
            );
          });

          state.exportNamed.forEach(e => {
            body.push(
              exportTemplate({
                LOCAL: t.identifier(e.local),
                REMOTE: t.identifier(e.remote),
              }),
            );
          });

          if (
            state.exportDefault.length ||
            state.exportAll.length ||
            state.exportNamed.length
          ) {
            body.unshift(esModuleExport());
          }
        },
      },
    },
  };
}

module.exports = importExportPlugin;
