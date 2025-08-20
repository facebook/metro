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

import type {ConfigT, InputConfigT} from 'metro-config';

declare var config: ConfigT;
declare var inputConfig: InputConfigT;

declare function isMutableArray<T: $ReadOnlyArray<mixed>>(
  arr: T,
): T extends Array<mixed> ? true : false;

// Ensure ConfigT satisfies InputConfigT
(config: InputConfigT);

// Ensure empty config satisfies InputConfigT
({}: InputConfigT);
// And it may be partial
({
  resolver: {},
  transformer: {},
  serializer: {},
  server: {},
  symbolicator: {},
}: InputConfigT);

// Both are deep read-only
(isMutableArray(config.cacheStores): false);
if (
  inputConfig.cacheStores != null &&
  typeof inputConfig.cacheStores !== 'function'
) {
  (isMutableArray(inputConfig.cacheStores): false);
}

// ConfigT is completely hydrated (no errors accessing deep props)
config.resolver.unstable_conditionsByPlatform['foo'];
config.transformer.assetPlugins[0];
