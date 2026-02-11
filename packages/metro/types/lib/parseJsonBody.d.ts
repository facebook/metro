/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @format
 * @oncall react_native
 */

import type {IncomingMessage} from 'http';

export type JsonData =
  | {[$$Key$$: string]: JsonData}
  | Array<JsonData>
  | string
  | number
  | boolean
  | null;
/**
 * Attempt to parse a request body as JSON.
 */
declare function parseJsonBody(
  req: IncomingMessage,
  options?: {strict?: boolean},
): Promise<JsonData>;
export default parseJsonBody;
