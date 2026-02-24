/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @noformat
 * @oncall react_native
 * @generated SignedSource<<669a46ab2a802ea2b93d98edf337fff0>>
 *
 * This file was translated from Flow by scripts/generateTypeScriptDefinitions.js
 * Original file: packages/metro/src/shared/output/RamBundle/buildSourcemapWithMetadata.js
 * To regenerate, run:
 *   js1 build metro-ts-defs (internal) OR
 *   yarn run build-ts-defs (OSS) 
 */

import type {ModuleGroups, ModuleTransportLike} from '../../types';
import type {IndexMap} from 'metro-source-map';

type Params = {
  fixWrapperOffset: boolean;
  lazyModules: ReadonlyArray<ModuleTransportLike>;
  moduleGroups: null | undefined | ModuleGroups;
  startupModules: ReadonlyArray<ModuleTransportLike>;
};
declare const $$EXPORT_DEFAULT_DECLARATION$$: ($$PARAM_0$$: Params) => IndexMap;
declare type $$EXPORT_DEFAULT_DECLARATION$$ =
  typeof $$EXPORT_DEFAULT_DECLARATION$$;
export default $$EXPORT_DEFAULT_DECLARATION$$;
