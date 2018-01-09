/**
 * Copyright (c) 2016-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 *
 * @format
 * @flow
 */

'use strict';

/* eslint-disable no-unclear-flowtypes */

const babelGenerate = require('babel-generator').default;

function generate(
  ast: Object,
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
