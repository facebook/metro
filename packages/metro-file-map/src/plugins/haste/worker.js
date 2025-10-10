/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow strict-local
 * @format
 */

/* eslint-disable import/no-commonjs */

'use strict';

const excludedExtensions = require('../../workerExclusionList');
const path = require('path');

/*::
import type {WorkerSetupArgs} from './types';
import type {MetadataWorker, WorkerMessage, V8Serializable} from '../../flow-types';
*/

const PACKAGE_JSON = path.sep + 'package.json';

module.exports = class Worker /*:: implements MetadataWorker */ {
  #enableHastePackages /*: boolean */;
  #hasteImpl /*: ?$ReadOnly<{getHasteName: string => ?string}> */;
  #hasteImplModulePath /*: ?string */ = null;

  constructor(setupArgs /*: WorkerSetupArgs */) {
    this.#enableHastePackages = setupArgs.enableHastePackages;
    if (setupArgs.hasteImplModulePath) {
      // $FlowFixMe[unsupported-syntax] - dynamic require
      this.#hasteImpl = require(setupArgs.hasteImplModulePath);
    }
  }

  processFile(
    data /*: WorkerMessage */,
    utils /*: $ReadOnly<{getContent: () => Buffer }> */,
  ) /*: V8Serializable */ {
    let hasteName /*: string | null */ = null;
    const {filePath} = data;
    if (this.#enableHastePackages && filePath.endsWith(PACKAGE_JSON)) {
      // Process a package.json that is returned as a PACKAGE type with its name.
      try {
        const fileData = JSON.parse(utils.getContent().toString());
        if (fileData.name) {
          hasteName = fileData.name;
        }
      } catch (err) {
        throw new Error(`Cannot parse ${filePath} as JSON: ${err.message}`);
      }
    } else if (
      this.#hasteImpl != null &&
      !excludedExtensions.has(filePath.substr(filePath.lastIndexOf('.')))
    ) {
      // Process a random file that is returned as a MODULE.
      hasteName = this.#hasteImpl?.getHasteName(filePath) || null;
    }
    return hasteName;
  }
};
