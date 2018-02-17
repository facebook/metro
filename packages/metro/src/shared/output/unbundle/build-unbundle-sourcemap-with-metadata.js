/**
 * Copyright (c) 2015-present, Facebook, Inc.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow
 * @format
 */
'use strict';

const {
  combineSourceMaps,
  combineSourceMapsAddingOffsets,
  joinModules,
} = require('./util');

import type {RamModule} from '../../../DeltaBundler/Serializers';
import type {ModuleGroups, ModuleTransportLike} from '../../types.flow';

type Params = {|
  fixWrapperOffset: boolean,
  lazyModules: $ReadOnlyArray<ModuleTransportLike | RamModule>,
  moduleGroups: ?ModuleGroups,
  startupModules: $ReadOnlyArray<ModuleTransportLike | RamModule>,
|};

module.exports = ({
  fixWrapperOffset,
  lazyModules,
  moduleGroups,
  startupModules,
}: Params) => {
  const options = fixWrapperOffset ? {fixWrapperOffset: true} : undefined;
  const startupModule: ModuleTransportLike = {
    code: joinModules(startupModules),
    id: Number.MIN_SAFE_INTEGER,
    map: combineSourceMaps(startupModules, undefined, options),
    sourcePath: '',
  };

  // Add map of module id -> source to sourcemap
  const module_paths = [];
  startupModules.forEach(m => {
    module_paths[m.id] = m.sourcePath;
  });
  lazyModules.forEach(m => {
    module_paths[m.id] = m.sourcePath;
  });

  const map = combineSourceMapsAddingOffsets(
    [startupModule].concat(lazyModules),
    module_paths,
    moduleGroups,
    options,
  );
  delete map.x_facebook_offsets[Number.MIN_SAFE_INTEGER];

  return map;
};
