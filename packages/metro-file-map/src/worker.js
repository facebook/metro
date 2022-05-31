/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow strict-local
 * @noformat
 */

/*::
import type {WorkerMessage, WorkerMetadata} from './flow-types';
*/

'use strict';

const H = require('./constants');
const dependencyExtractor = require('./lib/dependencyExtractor');
const exclusionList = require('./workerExclusionList');
const {createHash} = require('crypto');
const fs = require('graceful-fs');
const path = require('path');

const PACKAGE_JSON = path.sep + 'package.json';

let hasteImpl /*: ?{getHasteName: string => string} */ = null;
let hasteImplModulePath /*: ?string */ = null;

function sha1hex(content /*: string | Buffer */) /*: string */ {
  return createHash('sha1').update(content).digest('hex');
}

async function worker(
  data /*: WorkerMessage */,
) /*: Promise<WorkerMetadata> */ {
  if (
    data.hasteImplModulePath != null &&
    data.hasteImplModulePath !== hasteImplModulePath
  ) {
    if (hasteImpl) {
      throw new Error('metro-file-map: hasteImplModulePath changed');
    }
    hasteImplModulePath = data.hasteImplModulePath;
    // $FlowFixMe[unsupported-syntax] - dynamic require
    hasteImpl = require(hasteImplModulePath);
  }

  let content/*: ?string */;
  let dependencies/*: WorkerMetadata['dependencies'] */;
  let id/*: WorkerMetadata['id'] */;
  let module/*: WorkerMetadata['module'] */;
  let sha1/*: WorkerMetadata['sha1'] */;

  const {computeDependencies, computeSha1, rootDir, filePath} = data;

  const getContent = () /*: string */ => {
    if (content == null) {
      content = fs.readFileSync(filePath, 'utf8');
    }

    return content;
  };

  if (filePath.endsWith(PACKAGE_JSON)) {
    // Process a package.json that is returned as a PACKAGE type with its name.
    try {
      const fileData = JSON.parse(getContent());

      if (fileData.name) {
        const relativeFilePath = path.relative(rootDir, filePath);
        id = fileData.name;
        module = [relativeFilePath, H.PACKAGE];
      }
    } catch (err) {
      throw new Error(`Cannot parse ${filePath} as JSON: ${err.message}`);
    }
  } else if (!exclusionList.has(filePath.substr(filePath.lastIndexOf('.')))) {
    // Process a random file that is returned as a MODULE.
    if (hasteImpl) {
      id = hasteImpl.getHasteName(filePath);
    }

    if (computeDependencies) {
      dependencies = Array.from(
        data.dependencyExtractor != null
          // $FlowFixMe[unsupported-syntax] - dynamic require
          ? require(data.dependencyExtractor).extract(
              getContent(),
              filePath,
              dependencyExtractor.extract,
            )
          : dependencyExtractor.extract(getContent()),
      );
    }

    if (id != null) {
      const relativeFilePath = path.relative(rootDir, filePath);
      module = [relativeFilePath, H.MODULE];
    }
  }

  // If a SHA-1 is requested on update, compute it.
  if (computeSha1) {
    sha1 = sha1hex(getContent() || fs.readFileSync(filePath));
  }

  return {dependencies, id, module, sha1};
}

async function getSha1(
  data /*: WorkerMessage */,
) /*: Promise<WorkerMetadata> */ {
  const sha1 = data.computeSha1
    ? sha1hex(fs.readFileSync(data.filePath))
    : null;

  return {
    dependencies: undefined,
    id: undefined,
    module: undefined,
    sha1,
  };
}

module.exports = {
  worker,
  getSha1,
};
