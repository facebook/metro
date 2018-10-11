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
import type {TransformResult} from './DeltaBundler';
import type {ConfigT} from 'metro-config/src/configTypes.flow';

class Bundler {
  _depGraphPromise: Promise<DependencyGraph>;
  _transformer: Transformer;

  constructor(config: ConfigT) {
    this._depGraphPromise = DependencyGraph.load(config);

    this._depGraphPromise.then(dependencyGraph => {
      this._transformer = new Transformer(
        config,
        dependencyGraph.getSha1.bind(dependencyGraph),
      );
    });
  }

  async end() {
    const dependencyGraph = await this._depGraphPromise;

    this._transformer.end();
    dependencyGraph.getWatcher().end();
  }

  getDependencyGraph(): Promise<DependencyGraph> {
    return this._depGraphPromise;
  }

  async transformFile(
    filePath: string,
    transformOptions: TransformOptions,
  ): Promise<TransformResult<>> {
    // We need to be sure that the DependencyGraph has been initialized.
    // TODO: Remove this ugly hack!
    await this._depGraphPromise;

    return this._transformer.transformFile(filePath, transformOptions);
  }
}

module.exports = Bundler;
