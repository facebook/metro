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

const fs = require('fs');
const isAbsolutePath = require('absolute-path');
const path = require('path');

function getAbsolutePath(
  filePath: string,
  projectRoots: $ReadOnlyArray<string>,
): string {
  if (isAbsolutePath(filePath)) {
    return path.resolve(filePath);
  }

  for (let i = 0; i < projectRoots.length; i++) {
    const potentialAbsPath = path.resolve(projectRoots[i], filePath);
    if (fs.existsSync(potentialAbsPath)) {
      return potentialAbsPath;
    }
  }

  throw new NotFoundError(filePath, projectRoots);
}

class NotFoundError extends Error {
  status: number;
  type: string;

  constructor(relativePath: string, projectRoots: $ReadOnlyArray<string>) {
    super(
      `File not found: ${relativePath} in any of the project roots (${projectRoots.join(
        ', ',
      )})`,
    );

    this.type = 'NotFoundError';
    this.status = 404;
  }
}

module.exports = getAbsolutePath;
