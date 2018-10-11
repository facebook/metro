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

class ResourceNotFoundError extends Error {
  resourcePath: string;
  status: number;

  constructor(resourcePath: string) {
    super(`The resource \`${resourcePath}\` was not found.`);
    this.resourcePath = resourcePath;
    this.status = 404;
  }
}

module.exports = ResourceNotFoundError;
