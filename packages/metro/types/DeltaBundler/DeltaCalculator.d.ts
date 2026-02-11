/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @format
 * @oncall react_native
 */

import type {DeltaResult, Options} from './types';
import type {RootPerfLogger} from 'metro-config';
import type {ChangeEvent} from 'metro-file-map';

import {Graph} from './Graph';
import EventEmitter from 'events';
/**
 * This class is in charge of calculating the delta of changed modules that
 * happen between calls. To do so, it subscribes to file changes, so it can
 * traverse the files that have been changed between calls and avoid having to
 * traverse the whole dependency tree for trivial small changes.
 */
declare class DeltaCalculator<T> extends EventEmitter {
  _changeEventSource: EventEmitter;
  _options: Options<T>;
  _currentBuildPromise: null | undefined | Promise<DeltaResult<T>>;
  _deletedFiles: Set<string>;
  _modifiedFiles: Set<string>;
  _addedFiles: Set<string>;
  _requiresReset: boolean;
  _graph: Graph<T>;
  constructor(
    entryPoints: ReadonlySet<string>,
    changeEventSource: EventEmitter,
    options: Options<T>,
  );
  /**
   * Stops listening for file changes and clears all the caches.
   */
  end(): void;
  /**
   * Main method to calculate the delta of modules. It returns a DeltaResult,
   * which contain the modified/added modules and the removed modules.
   */
  getDelta($$PARAM_0$$: {
    reset: boolean;
    shallow: boolean;
  }): Promise<DeltaResult<T>>;
  /**
   * Returns the graph with all the dependencies. Each module contains the
   * needed information to do the traversing (dependencies, inverseDependencies)
   * plus some metadata.
   */
  getGraph(): Graph<T>;
  _handleMultipleFileChanges: (changeEvent: ChangeEvent) => void;
  /**
   * Handles a single file change. To avoid doing any work before it's needed,
   * the listener only stores the modified file, which will then be used later
   * when the delta needs to be calculated.
   */
  _handleFileChange: (
    $$PARAM_0$$: ChangeEvent['eventsQueue'][number],
    logger: null | undefined | RootPerfLogger,
  ) => unknown;
  _getChangedDependencies(
    modifiedFiles: Set<string>,
    deletedFiles: Set<string>,
    addedFiles: Set<string>,
  ): Promise<DeltaResult<T>>;
}
export default DeltaCalculator;
