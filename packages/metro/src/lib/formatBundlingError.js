/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @format
 * @flow
 */

'use strict';

import type {FormattedError} from 'metro-runtime/src/modules/types.flow';

const GraphNotFoundError = require('../IncrementalBundler/GraphNotFoundError');
const ResourceNotFoundError = require('../IncrementalBundler/ResourceNotFoundError');
const RevisionNotFoundError = require('../IncrementalBundler/RevisionNotFoundError');
const {
  UnableToResolveError,
} = require('../node-haste/DependencyGraph/ModuleResolution');
const {codeFrameColumns} = require('@babel/code-frame');
const ErrorStackParser = require('error-stack-parser');
const fs = require('fs');
const {AmbiguousModuleResolutionError} = require('metro-core');
const serializeError = require('serialize-error');

export type CustomError = Error &
  interface {
    type?: string,
    filename?: string,
    lineNumber?: number,
    errors?: Array<{
      description: string,
      filename: string,
      lineNumber: number,
      ...
    }>,
  };

function formatBundlingError(error: CustomError): FormattedError {
  if (error instanceof AmbiguousModuleResolutionError) {
    const he = error.hasteError;
    const message =
      "Ambiguous resolution: module '" +
      `${error.fromModulePath}\' tries to require \'${he.hasteName}\', but ` +
      'there are several files providing this module. You can delete or ' +
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
    return {
      ...serializeError(error),
      // Ensure the type is passed to the client.
      type: error.type,
      errors: [
        {
          description: error.message,
          filename: error.filename,
          lineNumber: error.lineNumber,
        },
      ],
    };
  } else if (error instanceof ResourceNotFoundError) {
    return {
      type: 'ResourceNotFoundError',
      // $FlowFixMe[incompatible-return]
      errors: [],
      message: error.message,
    };
  } else if (error instanceof GraphNotFoundError) {
    return {
      type: 'GraphNotFoundError',
      // $FlowFixMe[incompatible-return]
      errors: [],
      message: error.message,
    };
  } else if (error instanceof RevisionNotFoundError) {
    return {
      type: 'RevisionNotFoundError',
      // $FlowFixMe[incompatible-return]
      errors: [],
      message: error.message,
    };
  } else {
    const stack = ErrorStackParser.parse(error);
    const fileName = stack[0].fileName;
    const column = stack[0].columnNumber;
    const line = stack[0].lineNumber;

    let codeFrame = '';
    try {
      codeFrame = codeFrameColumns(
        // If the error was thrown in a node.js builtin module, this call will fail and mask the real error.
        fs.readFileSync(fileName, 'utf8'),
        {
          start: {column, line},
        },
        {forceColor: true},
      );
    } catch {}

    return {
      type: 'InternalError',
      errors: [],
      message: `Metro has encountered an error: ${error.message}: ${fileName} (${line}:${column})\n\n${codeFrame}`,
    };
  }
}

module.exports = formatBundlingError;
