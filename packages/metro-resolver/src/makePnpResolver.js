/**
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow
 * @format
 */

'use strict';

// $FlowFixMe it exists!
const Module = require('module');

const path = require('path');

import type {ResolutionContext} from './types';

const builtinModules = new Set(
  // $FlowFixMe "process.binding" exists
  Module.builtinModules || Object.keys(process.binding('natives')),
);

module.exports = (pnp: any) => (
  context: ResolutionContext,
  request: string,
  platform: string | null,
) => {
  // We don't support builtin modules, so we force pnp to resolve those
  // modules as regular npm packages by appending a `/` character
  if (builtinModules.has(request)) {
    request += '/';
  }

  const unqualifiedPath = pnp.resolveToUnqualified(
    request,
    context.originModulePath,
  );

  const baseExtensions = context.sourceExts.map(extension => `.${extension}`);
  let finalExtensions = [...baseExtensions];

  if (context.preferNativePlatform) {
    finalExtensions = [
      ...baseExtensions.map(extension => `.native${extension}`),
      ...finalExtensions,
    ];
  }

  if (platform) {
    // We must keep a const reference to make Flow happy
    const p = platform;

    finalExtensions = [
      ...baseExtensions.map(extension => `.${p}${extension}`),
      ...finalExtensions,
    ];
  }

  try {
    return {
      type: 'sourceFile',
      filePath: pnp.resolveUnqualified(unqualifiedPath, {
        extensions: finalExtensions,
      }),
    };
  } catch (error) {
    // Only catch the error if it was caused by the resolution process
    if (error.code !== 'QUALIFIED_PATH_RESOLUTION_FAILED') {
      throw error;
    }

    const dirname = path.dirname(unqualifiedPath);
    const basename = path.basename(unqualifiedPath);

    const assetResolutions = context.resolveAsset(dirname, basename, platform);

    if (assetResolutions) {
      return {
        type: 'assetFiles',
        filePaths: assetResolutions.map<string>(name => `${dirname}/${name}`),
      };
    } else {
      throw error;
    }
  }
};
