/**
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow strict-local
 * @format
 */

'use strict';

import type {Bundle, ModuleMap} from '../types.flow';

const PRAGMA = '//# offsetTable=';

function sliceModules(
  offsetTable: Array<[number, number]>,
  str: string,
  startOffset: number,
): [number, ModuleMap] {
  const modules = [];
  let offset = startOffset;
  for (const [id, length] of offsetTable) {
    modules.push([id, str.slice(offset, offset + length)]);
    // Modules are separated by a line break.
    offset += length + 1;
  }
  return [offset, modules];
}

/**
 * Parses a bundle from an embedded delta bundle.
 */
function stringToBundle(str: string): Bundle {
  // TODO(T34761233): This is a potential security risk!
  // It is prone to failure or exploit if the pragma isn't present at
  // the end of the bundle, since it will also match any string that
  // contains it.
  //
  // The only way to be sure that the pragma is a comment is to
  // implement a simple tokenizer, and making sure that our pragma is:
  // * at the beginning of a line (whitespace notwithstanding)
  // * not inside of a multiline comment (/* */);
  // * not inside of a multiline string (`` or escaped "").
  //
  // One way to avoid this would be to
  // require the comment to be either at the very start or at the very
  // end of the bundle.
  const pragmaIndex = str.lastIndexOf(PRAGMA);
  if (pragmaIndex === -1) {
    throw new Error('stringToBundle: Pragma not found in string bundle.');
  }

  const tableStart = pragmaIndex + PRAGMA.length;
  const tableEnd = str.indexOf('\n', tableStart);

  const offsetTable = JSON.parse(
    str.slice(tableStart, tableEnd === -1 ? str.length : tableEnd),
  );

  const pre = str.slice(0, offsetTable.pre);
  const [offset, modules] = sliceModules(
    offsetTable.modules,
    str,
    // There's a line break after the pre segment.
    offsetTable.pre + 1,
  );
  // We technically don't need the bundle post segment length, since it should
  // normally stop right before the pragma.
  const post = str.slice(offset, offset + offsetTable.post);

  const bundle = {
    base: true,
    revisionId: offsetTable.revisionId,
    pre,
    post,
    modules,
  };

  return bundle;
}

module.exports = stringToBundle;
