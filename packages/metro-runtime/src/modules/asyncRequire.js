/**
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @format
 * @flow strict
 */

'use strict';

// $FlowExpectedError Flow does not know about Metro's require extensions.
const dynamicRequire = (require: {importAll: mixed => mixed});
function asyncRequire(moduleID: mixed): Promise<mixed> {
  return Promise.resolve().then(() => dynamicRequire.importAll(moduleID));
}

asyncRequire.prefetch = function(moduleID: number, moduleName: string): void {};

asyncRequire.resource = function(moduleID: number, moduleName: string): empty {
  throw new Error('Not implemented');
};

asyncRequire.addImportBundleNames = function(importBundleNames: mixed): void {
  throw new Error(
    'This bundle was compiled with transformer.experimentalImportBundleSupport=true but is using an incompatible version of asyncRequire.',
  );
};

module.exports = asyncRequire;
