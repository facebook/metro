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

'use strict';

import type {TransformResultWithSource} from './DeltaBundler';
import type {TransformOptions} from './DeltaBundler/Worker';
import type EventEmitter from 'events';
import type {ConfigT} from 'metro-config/src/configTypes.flow';

const Transformer = require('./DeltaBundler/Transformer');
const DependencyGraph = require('./node-haste/DependencyGraph');

export type BundlerOptions = $ReadOnly<{
  hasReducedPerformance?: boolean,
  watch?: boolean,
}>;

class Bundler {
  _depGraph: DependencyGraph;
  _initializedPromise: Promise<void>;
  _transformer: Transformer;

  constructor(config: ConfigT, options?: BundlerOptions) {
    this._depGraph = new DependencyGraph(config, options);

    this._initializedPromise = this._depGraph
      .ready()
      .then(() => {
        config.reporter.update({type: 'transformer_load_started'});
        this._transformer = new Transformer(
          config,
          config.watcher.unstable_lazySha1
            ? // This object-form API is expected to replace passing a function
              // once lazy SHA1 is stable. This will be a breaking change.
              {
                unstable_getOrComputeSha1: filePath =>
                  this._depGraph.unstable_getOrComputeSha1(filePath),
              }
            : (...args) => this._depGraph.getSha1(...args),
        );
        config.reporter.update({type: 'transformer_load_done'});
      })
      .catch(error => {
        console.error('Failed to construct transformer: ', error);
        config.reporter.update({
          type: 'transformer_load_failed',
          error,
        });
      });
  }

  getWatcher(): EventEmitter {
    return this._depGraph.getWatcher();
  }

  async end(): Promise<void> {
    await this.ready();

    await this._transformer.end();
    await this._depGraph.end();
  }

  async getDependencyGraph(): Promise<DependencyGraph> {
    await this.ready();

    return this._depGraph;
  }

  async transformFile(
    filePath: string,
    transformOptions: TransformOptions,
    /** Optionally provide the file contents, this can be used to provide virtual contents for a file. */
    fileBuffer?: Buffer,
  ): Promise<TransformResultWithSource<>> {
    // We need to be sure that the DependencyGraph has been initialized.
    // TODO: Remove this ugly hack!
    await this.ready();

    return this._transformer.transformFile(
      filePath,
      transformOptions,
      fileBuffer,
    );
  }

  // Waits for the bundler to become ready.
  async ready(): Promise<void> {
    await this._initializedPromise;
  }
}

module.exports = Bundler;
