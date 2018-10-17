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

const Bundler = require('./Bundler');
const DeltaBundler = require('./DeltaBundler');
const ResourceNotFoundError = require('./DeltaBundler/ResourceNotFoundError');

const crypto = require('crypto');
const fs = require('fs');
const getPrependedScripts = require('./lib/getPrependedScripts');
const path = require('path');
const transformHelpers = require('./lib/transformHelpers');

import type {Options as DeltaBundlerOptions} from './DeltaBundler/types.flow';
import type {DeltaResult, Module, Graph} from './DeltaBundler';
import type {TransformInputOptions} from './lib/transformHelpers';
import type {BundleOptions} from './shared/types.flow';
import type {ConfigT} from 'metro-config/src/configTypes.flow';

export type GraphId = string;
export type RevisionId = string;

export type OutputGraph = Graph<>;

export type GraphRevision = {|
  // Identifies the last computed rev.
  +id: RevisionId,
  +date: Date,
  +graph: OutputGraph,
  +prepend: $ReadOnlyArray<Module<>>,
|};

class IncrementalBundler {
  _config: ConfigT;
  _bundler: Bundler;
  _deltaBundler: DeltaBundler<>;
  _revisions: Map<GraphId, Promise<GraphRevision>> = new Map();

  static getGraphId(options: BundleOptions): GraphId {
    // This setup ensures that if we add a field to BuildOptions, we will need
    // to update this function to make sure that the GraphId is still valid.
    // The double diff is making an intersection operation.
    const relevantParams: $Diff<
      BundleOptions,
      $Diff<
        BundleOptions,
        {
          entryFile: $PropertyType<BundleOptions, 'entryFile'>,
          customTransformOptions: $PropertyType<
            BundleOptions,
            'customTransformOptions',
          >,
          dev: $PropertyType<BundleOptions, 'dev'>,
          hot: $PropertyType<BundleOptions, 'hot'>,
          minify: $PropertyType<BundleOptions, 'minify'>,
          platform: $PropertyType<BundleOptions, 'platform'>,
        },
      >,
    > = {
      entryFile: options.entryFile,
      customTransformOptions: options.customTransformOptions,
      dev: options.dev,
      hot: options.hot,
      minify: options.minify,
      // Platform is nullable, but undefined and null aren't represented the
      // same way in JSON, so we need to normalize it.
      platform: options.platform || null,
    };

    return JSON.stringify(relevantParams);
  }

  constructor(config: ConfigT) {
    this._config = config;
    this._bundler = new Bundler(config);
    this._deltaBundler = new DeltaBundler(this._bundler);
  }

  end() {
    this._deltaBundler.end();
    this._bundler.end();
  }

  getBundler(): Bundler {
    return this._bundler;
  }

  getDeltaBundler(): DeltaBundler<> {
    return this._deltaBundler;
  }

  getRevisions(): Map<GraphId, Promise<GraphRevision>> {
    return this._revisions;
  }

  async buildGraphForEntries(
    entryFiles: $ReadOnlyArray<string>,
    options: TransformInputOptions,
    otherOptions?: {
      onProgress: $PropertyType<DeltaBundlerOptions<>, 'onProgress'>,
    } = {
      onProgress: null,
    },
  ): Promise<OutputGraph> {
    const absoluteEntryFiles = entryFiles.map(entryFile =>
      path.resolve(this._config.projectRoot, entryFile),
    );

    await Promise.all(
      absoluteEntryFiles.map(
        entryFile =>
          new Promise((resolve, reject) => {
            // This should throw an error if the file doesn't exist.
            // Using this instead of fs.exists to account for SimLinks.
            fs.realpath(entryFile, err => {
              if (err) {
                reject(new ResourceNotFoundError(entryFile));
              } else {
                resolve();
              }
            });
          }),
      ),
    );

    const graph = await this._deltaBundler.buildGraph(absoluteEntryFiles, {
      resolve: await transformHelpers.getResolveDependencyFn(
        this._bundler,
        options.platform,
      ),
      transform: await transformHelpers.getTransformFn(
        absoluteEntryFiles,
        this._bundler,
        this._deltaBundler,
        this._config,
        options,
      ),
      onProgress: otherOptions.onProgress,
    });

    this._config.serializer.experimentalSerializerHook(graph, {
      modified: graph.dependencies,
      deleted: new Set(),
      reset: true,
    });

    return graph;
  }

  async buildGraph(options: BundleOptions): Promise<GraphRevision> {
    const transformOptions = {
      customTransformOptions: options.customTransformOptions,
      dev: options.dev,
      hot: options.hot,
      minify: options.minify,
      platform: options.platform,
    };

    const graph = await this.buildGraphForEntries(
      [options.entryFile],
      {
        ...transformOptions,
        type: 'module',
      },
      {
        onProgress: options.onProgress,
      },
    );

    const prepend = await getPrependedScripts(
      this._config,
      transformOptions,
      this._bundler,
      this._deltaBundler,
    );

    return {
      id: crypto.randomBytes(8).toString('hex'),
      date: new Date(),
      prepend,
      graph,
    };
  }

  async updateGraph(
    options: BundleOptions,
    // This type union might seem strange, but it's the only way I've found to
    // make flow refine the type of revOptions correctly when options.rebuild
    // is undefined.
    revOptions:
      | {|revisionId: ?string|}
      | {|rebuild: true|}
      | {|rebuild: false|},
  ): Promise<{revision: GraphRevision, delta: DeltaResult<>}> {
    const graphId = IncrementalBundler.getGraphId(options);
    let revPromise = this._revisions.get(graphId);

    if (revPromise == null) {
      revPromise = this.buildGraph(options);

      this._revisions.set(graphId, revPromise);
      const revision = await revPromise;

      const delta = {
        modified: revision.graph.dependencies,
        deleted: new Set(),
        reset: true,
      };

      return {
        revision,
        delta,
      };
    }

    let revision = await revPromise;

    let delta;
    if (revOptions.rebuild === true) {
      delta = await this._deltaBundler.getDelta(revision.graph, {
        reset: false,
      });
    } else if (revOptions.rebuild === false) {
      delta = {
        modified: new Map(),
        deleted: new Set(),
        reset: false,
      };
    } else {
      delta = await this._deltaBundler.getDelta(revision.graph, {
        reset: revision.id !== revOptions.revisionId,
      });
    }

    this._config.serializer.experimentalSerializerHook(revision.graph, delta);

    if (delta.modified.size > 0) {
      revision = {
        ...revision,
        // Generate a new rev id, to be used to verify the next delta request.
        id: crypto.randomBytes(8).toString('hex'),
        date: new Date(),
      };
      this._revisions.set(graphId, Promise.resolve(revision));
    }

    return {revision, delta};
  }
}

module.exports = IncrementalBundler;
