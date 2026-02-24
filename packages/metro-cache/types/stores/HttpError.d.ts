/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @noformat
 * @generated SignedSource<<7a0b4b83fb44651820333ade6a980ef7>>
 *
 * This file was translated from Flow by scripts/generateTypeScriptDefinitions.js
 * Original file: packages/metro-cache/src/stores/HttpError.js
 * To regenerate, run:
 *   js1 build metro-ts-defs (internal) OR
 *   yarn run build-ts-defs (OSS) 
 */

declare class HttpError extends Error {
  code: number;
  constructor(message: string, code: number);
}
export default HttpError;
