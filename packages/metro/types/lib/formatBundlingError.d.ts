/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @noformat
 * @generated SignedSource<<0c18118765a7730747fbadfd10e5d8f6>>
 *
 * This file was translated from Flow by scripts/generateTypeScriptDefinitions.js
 * Original file: packages/metro/src/lib/formatBundlingError.js
 * To regenerate, run:
 *   js1 build metro-ts-defs (internal) OR
 *   yarn run build-ts-defs (OSS) 
 */

import type {FormattedError} from 'metro-runtime/src/modules/types';

export type CustomError = Error & {
  readonly type?: string;
  filename?: string;
  lineNumber?: number;
  errors?: Array<{
    description: string;
    filename: string;
    lineNumber: number;
  }>;
};
declare function formatBundlingError(error: CustomError): FormattedError;
export default formatBundlingError;
