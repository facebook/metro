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

import type {TransformInputOptions} from './transformHelpers';

export opaque type GraphId: string = string;

// TODO T35181528 (alexkirsz) This function is extracted from metro-cache.
// We could re-use stableHash instead.
function canonicalize(key: string, value: mixed): mixed {
  if (!(value instanceof Object) || value instanceof Array) {
    return value;
  }

  const keys = Object.keys(value).sort();
  const length = keys.length;
  const object = {};

  for (let i = 0; i < length; i++) {
    object[keys[i]] = value[keys[i]];
  }

  return object;
}

function getGraphId(
  entryFile: string,
  options: TransformInputOptions,
): GraphId {
  return JSON.stringify(
    {
      entryFile,
      options: {
        customTransformOptions: options.customTransformOptions || null,
        dev: options.dev,
        experimentalImportSupport: options.experimentalImportSupport || false,
        hot: options.hot,
        minify: options.minify,
        platform: options.platform != null ? options.platform : null,
        type: options.type,
      },
    },
    canonicalize,
  );
}

module.exports = getGraphId;
