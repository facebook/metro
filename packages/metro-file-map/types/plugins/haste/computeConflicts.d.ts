/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @format
 */

import type {HasteMapItem} from '../../flow-types';

type Conflict = {
  id: string;
  platform: string | null;
  absolutePaths: Array<string>;
  type: 'duplicate' | 'shadowing';
};
export declare function computeHasteConflicts(
  options: Readonly<{
    duplicates: ReadonlyMap<
      string,
      ReadonlyMap<string, ReadonlyMap<string, number>>
    >;
    map: ReadonlyMap<string, HasteMapItem>;
    rootDir: string;
  }>,
): Array<Conflict>;
