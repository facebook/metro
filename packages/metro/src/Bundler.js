/**
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow
 * @format
 */

'use strict';

const DependencyGraph = require('./node-haste/DependencyGraph');
const Transformer = require('./DeltaBundler/Transformer');

import type {WorkerOptions} from './DeltaBundler/Worker';
import type {TransformResult} from './DeltaBundler';
import type {ConfigT} from 'metro-config/src/configTypes.flow';

class Bundler {
  _depGraphPromise: Promise<DependencyGraph>;
  _transformer: Transformer;

  constructor(opts: ConfigT) {
    this._depGraphPromise = DependencyGraph.load({
      assetExts: opts.resolver.assetExts,
      blacklistRE: opts.resolver.blacklistRE,
      extraNodeModules: opts.resolver.extraNodeModules,
      hasteImplModulePath: opts.resolver.hasteImplModulePath,
      mainFields: opts.resolver.resolverMainFields,
      maxWorkers: opts.maxWorkers,
      platforms: new Set(opts.resolver.platforms),
      projectRoot: opts.projectRoot,
      providesModuleNodeModules: opts.resolver.providesModuleNodeModules,
      reporter: opts.reporter,
      resetCache: opts.resetCache,
      resolveRequest: opts.resolver.resolveRequest,
      sourceExts: opts.resolver.sourceExts,
      useWatchman: opts.resolver.useWatchman,
      watch: opts.watch,
      watchFolders: opts.watchFolders,
    });

    this._depGraphPromise.then(dependencyGraph => {
      this._transformer = new Transformer(
        opts,
        dependencyGraph.getSha1.bind(dependencyGraph),
      );
    });
  }

  async end() {
    this._transformer.end();
    await this._depGraphPromise.then(dependencyGraph =>
      dependencyGraph.getWatcher().end(),
    );
  }

  getDependencyGraph(): Promise<DependencyGraph> {
    return this._depGraphPromise;
  }

  async transformFile(
    filePath: string,
    workerOptions: WorkerOptions,
  ): Promise<TransformResult<>> {
    // We need to be sure that the DependencyGraph has been initialized.
    // TODO: Remove this ugly hack!
    await this._depGraphPromise;

    return this._transformer.transformFile(filePath, workerOptions);
  }
}

module.exports = Bundler;
