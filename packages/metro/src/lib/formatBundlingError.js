/**
 * Copyright (c) 2015-present, Facebook, Inc.
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

const {
  UnableToResolveError,
} = require('../node-haste/DependencyGraph/ModuleResolution');
const {
  AmbiguousModuleResolutionError,
} = require('../node-haste/DependencyGraph/ResolutionRequest');

export type CustomError = Error & {|
  status?: number,
  type?: string,
  description?: string,
  filename?: string,
  lineNumber?: number,
  errors?: Array<{
    description: string,
    filename: string,
    lineNumber: number,
  }>,
|};

function formatBundlingError(
  error: CustomError,
): {type: string, message: string, errors: Array<{description: string}>} {
  if (error instanceof AmbiguousModuleResolutionError) {
    const he = error.hasteError;
    const message =
      "Ambiguous resolution: module '" +
      `${error.fromModulePath}\' tries to require \'${he.hasteName}\', but ` +
      `there are several files providing this module. You can delete or ` +
      'fix them: \n\n' +
      Object.keys(he.duplicatesSet)
        .sort()
        .map(dupFilePath => `${dupFilePath}`)
        .join('\n\n');

    return {
      type: 'AmbiguousModuleResolutionError',
      message,
      errors: [{description: message}],
    };
  }

  if (
    error instanceof UnableToResolveError ||
    (error instanceof Error &&
      (error.type === 'TransformError' || error.type === 'NotFoundError'))
  ) {
    error.errors = [
      {
        description: error.description,
        filename: error.filename,
        lineNumber: error.lineNumber,
      },
    ];

    return error;
  } else {
    return {
      type: 'InternalError',
      errors: [],
      message:
        'Metro Bundler has encountered an internal error, ' +
        'please check your terminal error output for more details',
    };
  }
}

module.exports = formatBundlingError;
