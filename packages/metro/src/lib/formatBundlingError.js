/**
 * Copyright (c) 2015-present, Facebook, Inc.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @format
 * @flow
 */

'use strict';

const serializeError = require('serialize-error');

const {
  UnableToResolveError,
} = require('../node-haste/DependencyGraph/ModuleResolution');
const {AmbiguousModuleResolutionError} = require('metro-core');

export type CustomError = Error & {|
  status?: number,
  type?: string,
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
        description: error.message,
        filename: error.filename,
        lineNumber: error.lineNumber,
      },
    ];

    return serializeError(error);
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
