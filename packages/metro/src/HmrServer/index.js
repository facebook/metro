/**
 * Copyright (c) 2015-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 *
 * @format
 * @flow
 */

'use strict';

const addParamsToDefineCall = require('../lib/addParamsToDefineCall');
const formatBundlingError = require('../lib/formatBundlingError');
const getBundlingOptionsForHmr = require('./getBundlingOptionsForHmr');
const querystring = require('querystring');
const url = require('url');

const {
  Logger: {createActionStartEntry, createActionEndEntry, log},
} = require('metro-core');

import type DeltaTransformer from '../DeltaBundler/DeltaTransformer';
import type PackagerServer from '../Server';
import type {Reporter} from '../lib/reporting';

type Client = {|
  deltaTransformer: DeltaTransformer,
  sendFn: (data: string) => mixed,
|};

/**
 * The HmrServer (Hot Module Reloading) implements a lightweight interface
 * to communicate easily to the logic in the React Native repository (which
 * is the one that handles the Web Socket connections).
 *
 * This interface allows the HmrServer to hook its own logic to WS clients
 * getting connected, disconnected or having errors (through the
 * `onClientConnect`, `onClientDisconnect` and `onClientError` methods).
 */
class HmrServer<TClient: Client> {
  _packagerServer: PackagerServer;
  _reporter: Reporter;

  constructor(packagerServer: PackagerServer) {
    this._packagerServer = packagerServer;
    this._reporter = packagerServer.getReporter();
  }

  async onClientConnect(
    clientUrl: string,
    sendFn: (data: string) => mixed,
  ): Promise<Client> {
    const {bundleEntry, platform} = querystring.parse(
      /* $FlowFixMe: url might be null */
      url.parse(clientUrl).query,
    );

    // Create a new DeltaTransformer for each client. Once the clients are
    // modified to support Delta Bundles, they'll be able to pass the
    // DeltaBundleId param through the WS connection and we'll be able to share
    // the same DeltaTransformer between the WS connection and the HTTP one.
    const deltaBundler = this._packagerServer.getDeltaBundler();
    const {deltaTransformer} = await deltaBundler.getDeltaTransformer(
      getBundlingOptionsForHmr(bundleEntry, platform),
    );

    // Trigger an initial build to start up the DeltaTransformer.
    await deltaTransformer.getDelta();

    // Listen to file changes.
    const client = {sendFn, deltaTransformer};
    deltaTransformer.on('change', this._handleFileChange.bind(this, client));

    return client;
  }

  onClientError(client: TClient, e: Error) {
    this._reporter.update({
      type: 'hmr_client_error',
      error: e,
    });
    this.onClientDisconnect(client);
  }

  onClientDisconnect(client: TClient) {
    // We can safely remove all listeners from the delta transformer since the
    // transformer is not shared between clients.
    client.deltaTransformer.removeAllListeners('change');
  }

  async _handleFileChange(client: Client) {
    const processingHmrChange = log(
      createActionStartEntry({action_name: 'Processing HMR change'}),
    );

    client.sendFn(JSON.stringify({type: 'update-start'}));
    const response = await this._prepareResponse(client);

    client.sendFn(JSON.stringify(response));
    client.sendFn(JSON.stringify({type: 'update-done'}));

    log({
      ...createActionEndEntry(processingHmrChange),
      outdated_modules: Array.isArray(response.body.modules)
        ? response.body.modules.length
        : null,
    });
  }

  async _prepareResponse(client: Client): Promise<{type: string, body: {}}> {
    let result;

    try {
      result = await client.deltaTransformer.getDelta();
    } catch (error) {
      const formattedError = formatBundlingError(error);

      this._reporter.update({type: 'bundling_error', error});

      return {type: 'error', body: formattedError};
    }
    const modules = [];

    const inverseDependencies = await client.deltaTransformer.getInverseDependencies();

    for (const [id, module] of result.delta) {
      // The Delta Bundle can have null objects: these correspond to deleted
      // modules, which we don't need to send to the client.
      if (module != null) {
        // When there are new modules added on the dependency tree, they are
        // appended on the Delta Bundle, but HMR needs to have them at the
        // beginning.
        modules.unshift(
          this._prepareModule(id, module.code, inverseDependencies),
        );
      }
    }

    return {
      type: 'update',
      body: {
        modules,
        sourceURLs: {},
        sourceMappingURLs: {}, // TODO: handle Source Maps
      },
    };
  }

  /**
   * We need to add the inverse dependencies of that specific module into
   * the define() call, to make the HMR logic in the client able to propagate
   * the changes to the module dependants, if needed.
   *
   * To do so, we need to append the inverse dependencies object as the last
   * parameter to the __d() call from the code that we get from the bundler.
   *
   * So, we need to transform this:
   *
   *   __d(
   *     function(global, ...) { (module transformed code) },
   *     moduleId,
   *     dependencyMap?,
   *     moduleName?
   *   );
   *
   * Into this:
   *
   *   __d(
   *     function(global, ...) { (module transformed code) },
   *     moduleId,
   *     dependencyMap?,
   *     moduleName?,
   *     inverseDependencies,
   *   );
   */
  _prepareModule(
    id: number,
    code: string,
    inverseDependencies: Map<number, $ReadOnlyArray<number>>,
  ): {id: number, code: string} {
    const moduleInverseDependencies = Object.create(null);

    this._addInverseDep(id, inverseDependencies, moduleInverseDependencies);

    return {
      id,
      code: addParamsToDefineCall(code, moduleInverseDependencies),
    };
  }

  /**
   * Instead of adding the whole inverseDependncies object into each changed
   * module (which can be really huge if the dependency graph is big), we only
   * add the needed inverseDependencies for each changed module (we do this by
   * traversing upwards the dependency graph).
   */
  _addInverseDep(
    module: number,
    inverseDependencies: Map<number, $ReadOnlyArray<number>>,
    moduleInverseDependencies: {
      [key: number]: Array<number>,
      __proto__: null,
    },
  ) {
    if (module in moduleInverseDependencies) {
      return;
    }

    moduleInverseDependencies[module] = [];

    for (const inverse of inverseDependencies.get(module) || []) {
      moduleInverseDependencies[module].push(inverse);

      this._addInverseDep(
        inverse,
        inverseDependencies,
        moduleInverseDependencies,
      );
    }
  }
}

module.exports = HmrServer;
