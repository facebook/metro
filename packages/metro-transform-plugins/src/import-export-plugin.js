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
const {expression} = require('@babel/template');

import type {Ast} from '@babel/core';
import type {Path} from '@babel/traverse';
import type {Types} from '@babel/types';

type State = {
  exportAll: Array<{file: string, loc: BabelSourceLocation, ...}>,
  exportDefault: Array<{local: string, loc: BabelSourceLocation, ...}>,
  exportNamed: Array<{
    local: string,
    remote: string,
    loc: BabelSourceLocation,
    ...
  }>,
  importDefault: Ast,
  importAll: Ast,
  opts: {
    importDefault: string,
    importAll: string,
    resolve: boolean,
    out?: {isESModule: boolean, ...},
    ...
  },
  ...
};

export type Visitors = {|
  visitor: {|
    ExportAllDeclaration: (path: Path, state: State) => void,
    ExportDefaultDeclaration: (path: Path, state: State) => void,
    ExportNamedDeclaration: (path: Path, state: State) => void,
    ImportDeclaration: (path: Path, state: State) => void,
    Program: {|
      enter: (path: Path, state: State) => void,
      exit: (path: Path, state: State) => void,
    |},
  |},
|};

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
const importSideEffectTemplate = template(`
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
const esModuleExportTemplate = template(`
  Object.defineProperty(exports, '__esModule', {value: true});
`);

/**
 * Resolution template in case it is requested.
 */
const resolveTemplate = expression(`
  require.resolve(NODE)
`);

/**
 * Enforces the resolution of a path to a fully-qualified one, if set.
 */
function resolvePath(node: {value: string, ...}, resolve: boolean) {
  if (!resolve) {
    return node;
  }

  return resolveTemplate({
    NODE: node,
  });
}

declare function withLocation(
  node: BabelNode,
  loc: BabelSourceLocation,
): BabelNode;

// eslint-disable-next-line no-redeclare
declare function withLocation(
  node: $ReadOnlyArray<BabelNode>,
  loc: BabelSourceLocation,
): Array<BabelNode>;

// eslint-disable-next-line no-redeclare
function withLocation(node, loc) {
  if (Array.isArray(node)) {
    return node.map(n => withLocation(n, loc));
  }
  if (!node.loc) {
    return {...node, loc};
  }
  return node;
}

function importExportPlugin({types: t}: {types: Types, ...}): Visitors {
  return {
    visitor: {
      ExportAllDeclaration(path: Path, state: State): void {
        if (path.node.exportKind && path.node.exportKind !== 'value') {
          return;
        }

        state.exportAll.push({
          file: path.get('source').node.value,
          loc: path.node.loc,
        });

        path.remove();
      },

      ExportDefaultDeclaration(path: Path, state: State): void {
        if (path.node.exportKind && path.node.exportKind !== 'value') {
          return;
        }

        const declaration = path.get('declaration');
        const node = declaration.node;
        const id = node.id || path.scope.generateUidIdentifier('default');

        node.id = id;

        const loc = path.node.loc;

        state.exportDefault.push({
          local: id.name,
          loc,
        });

        if (t.isDeclaration(declaration)) {
          path.insertBefore(withLocation(node, loc));
        } else {
          path.insertBefore(
            withLocation(
              t.variableDeclaration('var', [t.variableDeclarator(id, node)]),
              loc,
            ),
          );
        }

        path.remove();
      },

      ExportNamedDeclaration(path: Path, state: State): void {
        if (path.node.exportKind && path.node.exportKind !== 'value') {
          return;
        }

        const declaration = path.get('declaration');
        const specifiers = path.get('specifiers');
        const loc = path.node.loc;

        if (declaration.node) {
          if (t.isVariableDeclaration(declaration)) {
            declaration.get('declarations').forEach(d => {
              switch (d.get('id').node.type) {
                case 'ObjectPattern':
                  {
                    const properties = d.get('id').get('properties');
                    properties.forEach(p => {
                      const name = p.get('key').node.name;
                      state.exportNamed.push({local: name, remote: name, loc});
                    });
                  }
                  break;
                case 'ArrayPattern':
                  {
                    const elements = d.get('id').get('elements');
                    elements.forEach(e => {
                      const name = e.node.name;
                      state.exportNamed.push({local: name, remote: name, loc});
                    });
                  }
                  break;
                default:
                  {
                    const name = d.get('id').node.name;
                    state.exportNamed.push({local: name, remote: name, loc});
                  }
                  break;
              }
            });
          } else {
            const id =
              declaration.node.id || path.scope.generateUidIdentifier();
            const name = id.name;

            declaration.node.id = id;
            state.exportNamed.push({local: name, remote: name, loc});
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
                  withLocation(
                    importTemplate({
                      IMPORT: state.importDefault,
                      FILE: resolvePath(path.node.source, state.opts.resolve),
                      LOCAL: temp,
                    }),
                    loc,
                  ),
                );

                state.exportNamed.push({
                  local: temp.name,
                  remote: remote.name,
                  loc,
                });
              } else if (remote.name === 'default') {
                path.insertBefore(
                  withLocation(
                    importNamedTemplate({
                      FILE: resolvePath(path.node.source, state.opts.resolve),
                      LOCAL: temp,
                      REMOTE: local,
                    }),
                    loc,
                  ),
                );

                state.exportDefault.push({local: temp.name, loc});
              } else {
                path.insertBefore(
                  withLocation(
                    importNamedTemplate({
                      FILE: resolvePath(path.node.source, state.opts.resolve),
                      LOCAL: temp,
                      REMOTE: local,
                    }),
                    loc,
                  ),
                );

                state.exportNamed.push({
                  local: temp.name,
                  remote: remote.name,
                  loc,
                });
              }
            } else {
              if (remote.name === 'default') {
                state.exportDefault.push({local: local.name, loc});
              } else {
                state.exportNamed.push({
                  local: local.name,
                  remote: remote.name,
                  loc,
                });
              }
            }
          });
        }

        path.remove();
      },

      ImportDeclaration(path: Path, state: State): void {
        if (path.node.importKind && path.node.importKind !== 'value') {
          return;
        }

        const file = path.get('source').node;
        const specifiers = path.get('specifiers');
        const anchor = path.scope.path.get('body.0');
        const loc = path.node.loc;

        if (!specifiers.length) {
          anchor.insertBefore(
            withLocation(
              importSideEffectTemplate({
                FILE: resolvePath(file, state.opts.resolve),
              }),
              loc,
            ),
          );
        } else {
          let sharedModuleImport = null;
          if (
            specifiers.filter(
              s =>
                s.node.type === 'ImportSpecifier' &&
                s.get('imported').node.name !== 'default',
            ).length > 1
          ) {
            sharedModuleImport = path.scope.generateUidIdentifierBasedOnNode(
              file,
            );
            path.scope.push({
              id: sharedModuleImport,
              init: withLocation(
                t.callExpression(t.identifier('require'), [
                  resolvePath(file, state.opts.resolve),
                ]),
                loc,
              ),
            });
          }

          specifiers.forEach(s => {
            const imported = s.get('imported').node;
            const local = s.get('local').node;

            switch (s.node.type) {
              case 'ImportNamespaceSpecifier':
                anchor.insertBefore(
                  withLocation(
                    importTemplate({
                      IMPORT: state.importAll,
                      FILE: resolvePath(file, state.opts.resolve),
                      LOCAL: local,
                    }),
                    loc,
                  ),
                );
                break;

              case 'ImportDefaultSpecifier':
                anchor.insertBefore(
                  withLocation(
                    importTemplate({
                      IMPORT: state.importDefault,
                      FILE: resolvePath(file, state.opts.resolve),
                      LOCAL: local,
                    }),
                    loc,
                  ),
                );
                break;

              case 'ImportSpecifier':
                if (imported.name === 'default') {
                  anchor.insertBefore(
                    withLocation(
                      importTemplate({
                        IMPORT: state.importDefault,
                        FILE: resolvePath(file, state.opts.resolve),
                        LOCAL: local,
                      }),
                      loc,
                    ),
                  );
                } else if (sharedModuleImport != null) {
                  path.scope.push({
                    id: local,
                    init: withLocation(
                      t.memberExpression(sharedModuleImport, imported),
                      loc,
                    ),
                  });
                } else {
                  anchor.insertBefore(
                    withLocation(
                      importNamedTemplate({
                        FILE: resolvePath(file, state.opts.resolve),
                        LOCAL: local,
                        REMOTE: imported,
                      }),
                      loc,
                    ),
                  );
                }
                break;

              default:
                throw new TypeError('Unknown import type: ' + s.node.type);
            }
          });
        }

        path.remove();
      },

      Program: {
        enter(path: Path, state: State): void {
          state.exportAll = [];
          state.exportDefault = [];
          state.exportNamed = [];

          state.importAll = t.identifier(state.opts.importAll);
          state.importDefault = t.identifier(state.opts.importDefault);
        },

        exit(path: Path, state: State): void {
          const body = path.node.body;

          state.exportDefault.forEach(
            (e: {local: string, loc: BabelSourceLocation, ...}) => {
              body.push(
                withLocation(
                  exportTemplate({
                    LOCAL: t.identifier(e.local),
                    REMOTE: t.identifier('default'),
                  }),
                  e.loc,
                ),
              );
            },
          );

          state.exportAll.forEach(
            (e: {file: string, loc: BabelSourceLocation, ...}) => {
              body.push(
                ...withLocation(
                  exportAllTemplate({
                    FILE: resolvePath(
                      t.stringLiteral(e.file),
                      state.opts.resolve,
                    ),
                    REQUIRED: path.scope.generateUidIdentifier(e.file),
                    KEY: path.scope.generateUidIdentifier('key'),
                  }),
                  e.loc,
                ),
              );
            },
          );

          state.exportNamed.forEach(
            (e: {
              local: string,
              remote: string,
              loc: BabelSourceLocation,
              ...
            }) => {
              body.push(
                withLocation(
                  exportTemplate({
                    LOCAL: t.identifier(e.local),
                    REMOTE: t.identifier(e.remote),
                  }),
                  e.loc,
                ),
              );
            },
          );

          if (
            state.exportDefault.length ||
            state.exportAll.length ||
            state.exportNamed.length
          ) {
            body.unshift(esModuleExportTemplate());
            if (state.opts.out) {
              state.opts.out.isESModule = true;
            }
          } else if (state.opts.out) {
            state.opts.out.isESModule = false;
          }
        },
      },
    },
  };
}

module.exports = importExportPlugin;
