/**
 * Copyright (c) 2018-present, Facebook, Inc.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow
 * @format
 */

'use strict';

const template = require('@babel/template').default;

const opts = {
  placeholderPattern: false,
  placeholderWhitelist: new Set(['LOCAL', 'FILE']),
};

/**
 * Produces a Babel template that transforms an "import * as x from ..." call
 * into a "const x = importAll(...)" call with the corresponding id in it.
 */
// In preparation for Babel's unique id generator.
const importAllTemplate = template(
  `
  const LOCAL = _$$_IMPORT_ALL(FILE);
`,
  opts,
);

/**
 * Produces a Babel template that transforms an "import x from ..." call into a
 * "const x = importDefault(...)" call with the corresponding id in it.
 */
// In preparation for Babel's unique id generator.
const importDefaultTemplate = template(
  `
  const LOCAL = _$$_IMPORT_DEFAULT(FILE);
`,
  opts,
);

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
      ImportDeclaration(path: Object, state: {}) {
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
                  importAllTemplate({
                    FILE: file,
                    LOCAL: local,
                  }),
                );
                break;

              case 'ImportDefaultSpecifier':
                anchor.insertBefore(
                  importDefaultTemplate({
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
    },
  };
}

module.exports = importExportPlugin;
