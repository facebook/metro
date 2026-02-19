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

/* eslint-disable import/no-commonjs */

'use strict';

const defaultDependencyExtractor = require('./dependencyExtractor');

/*::
import type {MetadataWorker, WorkerMessage, V8Serializable, DependencyExtractor} from '../../flow-types';
*/

module.exports = class DependencyExtractorWorker /*:: implements MetadataWorker */ {
  /*:: + */ #dependencyExtractor /*: ?DependencyExtractor */;

  constructor(
    {dependencyExtractor} /*: Readonly<{dependencyExtractor: ?string}> */,
  ) {
    if (dependencyExtractor != null) {
      // $FlowFixMe[unsupported-syntax] - dynamic require
      this.#dependencyExtractor = require(dependencyExtractor);
    }
  }

  processFile(
    data /*: WorkerMessage */,
    utils /*: Readonly<{getContent: () => Buffer}> */,
  ) /*: V8Serializable */ {
    const content = utils.getContent().toString();
    const {filePath} = data;

    const dependencies =
      this.#dependencyExtractor != null
        ? this.#dependencyExtractor.extract(
            content,
            filePath,
            defaultDependencyExtractor.extract,
          )
        : defaultDependencyExtractor.extract(content);

    // Return as array (PerFileData type)
    return Array.from(dependencies);
  }
};
