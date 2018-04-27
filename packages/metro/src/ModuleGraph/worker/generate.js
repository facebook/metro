/**
 * Copyright (c) 2016-present, Facebook, Inc.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @format
 * @flow
 */

'use strict';

const babelGenerate = require('@babel/generator').default;

import type {Ast} from '@babel/core';

function generate(
  ast: Ast,
  filename: string,
  sourceCode: string,
  compact: boolean,
) {
  const generated = babelGenerate(
    ast,
    {
      comments: false,
      compact,
      filename,
      sourceFileName: filename,
      sourceMaps: true,
      sourceMapTarget: filename,
    },
    sourceCode,
  );

  if (generated.map) {
    delete generated.map.sourcesContent;
  }
  return generated;
}

module.exports = generate;
