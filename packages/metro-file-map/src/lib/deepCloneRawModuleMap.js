/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @format
 * @flow strict-local
 */

import type {RawModuleMap, ReadOnlyRawModuleMap} from '../flow-types';

const mapMap = <K, V1, V2>(
  map: $ReadOnlyMap<K, V1>,
  mapFn: (v: V1) => V2,
): Map<K, V2> => {
  return new Map(
    Array.from(map.entries(), ([key, val]): [K, V2] => [key, mapFn(val)]),
  );
};

// This direct/manual approach is >2x faster than v8 deserialize(serialize) or
// a `structuredClone` implementation using worker_threads:
// https://github.com/nodejs/node/issues/39713#issuecomment-896884958
export default function deepCloneRawModuleMap(
  data: ReadOnlyRawModuleMap,
): RawModuleMap {
  return {
    duplicates: mapMap(data.duplicates, v =>
      mapMap(v, v2 => new Map(v2.entries())),
    ),
    map: mapMap(data.map, v =>
      Object.assign(
        Object.create(null),
        Object.fromEntries(
          Array.from(Object.entries(v), ([key, val]) => [key, [...val]]),
        ),
      ),
    ),
    mocks: new Map(data.mocks.entries()),
    rootDir: data.rootDir,
  };
}
