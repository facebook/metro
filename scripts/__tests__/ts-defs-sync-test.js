/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow strict-local
 * @format
 * @oncall react_native
 */

import {
  AUTO_GENERATED_PATTERNS,
  generateTsDefsForJsGlobs,
} from '../generateTypeScriptDefinitions';

test('TypeScript defs are in sync (yarn run build-ts-defs produces no changes)', async () => {
  let error;
  try {
    await generateTsDefsForJsGlobs(AUTO_GENERATED_PATTERNS, {verifyOnly: true});
  } catch (e) {
    error = e;
  }
  // If this is the usual type of error (issues with specific source files),
  // have Jest print the errors array so logs are a bit more helpful.
  // **If this fails, run `yarn run build-ts-defs` in Metro's root**
  if (error instanceof AggregateError) {
    expect(error.errors).toEqual([]);
  }
  expect(error).toBeUndefined();
}, 10000);
