/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @format
 *
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
