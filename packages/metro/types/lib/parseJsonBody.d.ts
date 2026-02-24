/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @noformat
 * @oncall react_native
 * @generated SignedSource<<cd5e7346556814416374b8c8e79a8674>>
 *
 * This file was translated from Flow by scripts/generateTypeScriptDefinitions.js
 * Original file: packages/metro/src/lib/parseJsonBody.js
 * To regenerate, run:
 *   js1 build metro-ts-defs (internal) OR
 *   yarn run build-ts-defs (OSS) 
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
