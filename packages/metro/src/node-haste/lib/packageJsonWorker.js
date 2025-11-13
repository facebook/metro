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

const path = require('path');

/*::
import type {MetadataWorker, WorkerMessage, V8Serializable} from 'metro-file-map/private/flow-types';
*/

const PACKAGE_JSON = path.sep + 'package.json';

module.exports = class Worker /*:: implements MetadataWorker */ {
  processFile(
    data /*: WorkerMessage */,
    {getContent} /*: $ReadOnly<{getContent: () => Buffer }> */,
  ) /*: V8Serializable */ {
    if (!data.filePath.endsWith(PACKAGE_JSON)) {
      return null;
    }
    const content = getContent();
    try {
      return JSON.parse(content.toString());
    } catch (e) {
      return null;
    }
  }
};
