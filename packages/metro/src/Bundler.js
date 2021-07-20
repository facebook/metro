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

import type {TransformOptions} from './DeltaBundler/Worker';
import type {TransformResultWithSource} from './DeltaBundler';
import type {ConfigT} from 'metro-config/src/configTypes.flow';

export type BundlerOptions = $ReadOnly<{|
  hasReducedPerformance?: boolean,
  watch?: boolean,
|}>;

class Bundler {
  _depGraphPromise: Promise<DependencyGraph>;
  _transformer: Transformer;

  constructor(config: ConfigT, options?: BundlerOptions) {
    this._depGraphPromise = DependencyGraph.load(config, options);

    this._depGraphPromise
      .then((dependencyGraph: DependencyGraph) => {
        this._transformer = new Transformer(
          config,
          // $FlowFixMe[method-unbinding] added when improving typing for this parameters
          dependencyGraph.getSha1.bind(dependencyGraph),
        );
      })
      .catch(error => {
        console.error('Failed to construct transformer: ', error);
      });
  }

  async end(): Promise<void> {
    const dependencyGraph = await this._depGraphPromise;

    this._transformer.end();
    dependencyGraph.getWatcher().end();
  }

  async getDependencyGraph(): Promise<DependencyGraph> {
    return await this._depGraphPromise;
  }

  async transformFile(
    filePath: string,
    transformOptions: TransformOptions,
  ): Promise<TransformResultWithSource<>> {
    // We need to be sure that the DependencyGraph has been initialized.
    // TODO: Remove this ugly hack!
    await this._depGraphPromise;

    return this._transformer.transformFile(filePath, transformOptions);
  }
}

module.exports = Bundler;
