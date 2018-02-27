/**
 * Copyright (c) 2015-present, Facebook, Inc.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow
 * @format
 */

'use strict';

import type {GetTransformOptions} from '../../Bundler';

/**
 * Returns the options needed to create a RAM bundle.
 */
async function getRamOptions(
  entryFile: string,
  options: {dev: boolean, platform: ?string},
  getDependencies: string => Iterable<string>,
  getTransformOptions: ?GetTransformOptions,
): Promise<{|
  +preloadedModules: {[string]: true},
  +ramGroups: Array<string>,
|}> {
  if (getTransformOptions == null) {
    return {
      preloadedModules: {},
      ramGroups: [],
    };
  }

  const {preloadedModules, ramGroups} = await getTransformOptions(
    [entryFile],
    {dev: options.dev, hot: true, platform: options.platform},
    async x => Array.from(getDependencies),
  );

  return {
    preloadedModules: preloadedModules || {},
    ramGroups: ramGroups || [],
  };
}

exports.getRamOptions = getRamOptions;
