/**
 * Copyright (c) 2015-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 *
 * @flow
 * @format
 */

'use strict';

const {
  initialTraverseDependencies,
  traverseDependencies,
} = require('./traverseDependencies');
const {EventEmitter} = require('events');

import type Bundler from '../Bundler';
import type {Options as JSTransformerOptions} from '../JSTransformer/worker';
import type DependencyGraph from '../node-haste/DependencyGraph';
import type Module from '../node-haste/Module';
import type {BundleOptions} from '../shared/types.flow';

export type DeltaResult = {|
  +modified: Map<string, Module>,
  +deleted: Set<string>,
  +reset: boolean,
|};

import type {DependencyEdges} from './traverseDependencies';

/**
 * This class is in charge of calculating the delta of changed modules that
 * happen between calls. To do so, it subscribes to file changes, so it can
 * traverse the files that have been changed between calls and avoid having to
 * traverse the whole dependency tree for trivial small changes.
 */
class DeltaCalculator extends EventEmitter {
  _bundler: Bundler;
  _dependencyGraph: DependencyGraph;
  _options: BundleOptions;
  _transformerOptions: ?JSTransformerOptions;

  _currentBuildPromise: ?Promise<DeltaResult>;
  _deletedFiles: Set<string> = new Set();
  _modifiedFiles: Set<string> = new Set();

  _dependencyEdges: DependencyEdges = new Map();

  constructor(
    bundler: Bundler,
    dependencyGraph: DependencyGraph,
    options: BundleOptions,
  ) {
    super();

    this._bundler = bundler;
    this._options = options;
    this._dependencyGraph = dependencyGraph;

    this._dependencyGraph
      .getWatcher()
      .on('change', this._handleMultipleFileChanges);
  }

  /**
   * Stops listening for file changes and clears all the caches.
   */
  end() {
    this._dependencyGraph
      .getWatcher()
      .removeListener('change', this._handleMultipleFileChanges);

    this.reset();
  }

  reset() {
    // Clean up all the cache data structures to deallocate memory.
    this._modifiedFiles = new Set();
    this._deletedFiles = new Set();
    this._dependencyEdges = new Map();
  }

  /**
   * Main method to calculate the delta of modules. It returns a DeltaResult,
   * which contain the modified/added modules and the removed modules.
   */
  async getDelta(): Promise<DeltaResult> {
    // If there is already a build in progress, wait until it finish to start
    // processing a new one (delta server doesn't support concurrent builds).
    if (this._currentBuildPromise) {
      await this._currentBuildPromise;
    }

    // We don't want the modified files Set to be modified while building the
    // bundle, so we isolate them by using the current instance for the bundling
    // and creating a new instance for the file watcher.
    const modifiedFiles = this._modifiedFiles;
    this._modifiedFiles = new Set();
    const deletedFiles = this._deletedFiles;
    this._deletedFiles = new Set();

    // Concurrent requests should reuse the same bundling process. To do so,
    // this method stores the promise as an instance variable, and then it's
    // removed after it gets resolved.
    this._currentBuildPromise = this._getChangedDependencies(
      modifiedFiles,
      deletedFiles,
    );

    let result;

    const numDependencies = this._dependencyEdges.size;

    try {
      result = await this._currentBuildPromise;
    } catch (error) {
      // In case of error, we don't want to mark the modified files as
      // processed (since we haven't actually created any delta). If we do not
      // do so, asking for a delta after an error will produce an empty Delta,
      // which is not correct.
      modifiedFiles.forEach(file => this._modifiedFiles.add(file));
      deletedFiles.forEach(file => this._deletedFiles.add(file));

      // If after an error the number of edges has changed, we could be in
      // a weird state. As a safe net we clean the dependency edges to force
      // a clean traversal of the graph next time.
      if (this._dependencyEdges.size !== numDependencies) {
        this._dependencyEdges = new Map();
      }

      throw error;
    } finally {
      this._currentBuildPromise = null;
    }

    return result;
  }

  /**
   * Returns the options object that is used by the transformer to parse
   * all the modules. This can be used by external objects to read again
   * any module very fast (since the options object instance will be the same).
   */
  async getTransformerOptions(): Promise<JSTransformerOptions> {
    if (!this._transformerOptions) {
      this._transformerOptions = await this._calcTransformerOptions();
    }
    return this._transformerOptions;
  }

  async _calcTransformerOptions(): Promise<JSTransformerOptions> {
    const {
      enableBabelRCLookup,
      projectRoot,
    } = this._bundler.getGlobalTransformOptions();

    const transformOptionsForBlacklist = {
      assetDataPlugins: this._options.assetPlugins,
      enableBabelRCLookup,
      dev: this._options.dev,
      hot: this._options.hot,
      inlineRequires: false,
      minify: this._options.minify,
      platform: this._options.platform,
      projectRoot,
    };

    const {
      inlineRequires,
    } = await this._bundler.getTransformOptionsForEntryFile(
      this._options.entryFile,
      {dev: this._options.dev, platform: this._options.platform},
      async path => {
        const {added} = await initialTraverseDependencies(
          path,
          this._dependencyGraph,
          transformOptionsForBlacklist,
          new Map(),
        );

        return [path, ...added];
      },
    );

    // $FlowFixMe flow does not recognize well Object.assign() return types.
    return {
      ...transformOptionsForBlacklist,
      inlineRequires: inlineRequires || false,
    };
  }

  /**
   * Returns all the dependency edges from the graph. Each edge contains the
   * needed information to do the traversing (dependencies, inverseDependencies)
   * plus some metadata.
   */
  getDependencyEdges(): DependencyEdges {
    return this._dependencyEdges;
  }

  _handleMultipleFileChanges = ({eventsQueue}) => {
    eventsQueue.forEach(this._handleFileChange);
  };

  /**
   * Handles a single file change. To avoid doing any work before it's needed,
   * the listener only stores the modified file, which will then be used later
   * when the delta needs to be calculated.
   */
  _handleFileChange = ({
    type,
    filePath,
  }: {
    type: string,
    filePath: string,
  }): mixed => {
    if (type === 'delete') {
      this._deletedFiles.add(filePath);
      this._modifiedFiles.delete(filePath);
    } else {
      this._modifiedFiles.add(filePath);
    }

    // Notify users that there is a change in some of the bundle files. This
    // way the client can choose to refetch the bundle.
    this.emit('change');
  };

  async _getChangedDependencies(
    modifiedFiles: Set<string>,
    deletedFiles: Set<string>,
  ): Promise<DeltaResult> {
    const transformerOptions = await this.getTransformerOptions();

    if (!this._dependencyEdges.size) {
      const path = this._dependencyGraph.getAbsolutePath(
        this._options.entryFile,
      );

      const modified = new Map([
        [path, this._dependencyGraph.getModuleForPath(path)],
      ]);

      const {added} = await initialTraverseDependencies(
        path,
        this._dependencyGraph,
        transformerOptions,
        this._dependencyEdges,
        this._options.onProgress || undefined,
      );

      for (const path of added) {
        modified.set(path, this._dependencyGraph.getModuleForPath(path));
      }

      return {
        modified,
        deleted: new Set(),
        reset: true,
      };
    }

    // If a file has been deleted, we want to invalidate any other file that
    // depends on it, so we can process it and correctly return an error.
    deletedFiles.forEach(filePath => {
      const edge = this._dependencyEdges.get(filePath);

      if (edge) {
        edge.inverseDependencies.forEach(path => modifiedFiles.add(path));
      }
    });

    // We only want to process files that are in the bundle.
    const modifiedDependencies = Array.from(modifiedFiles).filter(filePath =>
      this._dependencyEdges.has(filePath),
    );

    // No changes happened. Return empty delta.
    if (modifiedDependencies.length === 0) {
      return {modified: new Map(), deleted: new Set(), reset: false};
    }

    const {added, deleted} = await traverseDependencies(
      modifiedDependencies,
      this._dependencyGraph,
      transformerOptions,
      this._dependencyEdges,
      this._options.onProgress || undefined,
    );

    const modified = new Map();

    for (const path of modifiedDependencies) {
      modified.set(path, this._dependencyGraph.getModuleForPath(path));
    }

    for (const path of added) {
      modified.set(path, this._dependencyGraph.getModuleForPath(path));
    }

    return {
      modified,
      deleted,
      reset: false,
    };
  }
}

module.exports = DeltaCalculator;
