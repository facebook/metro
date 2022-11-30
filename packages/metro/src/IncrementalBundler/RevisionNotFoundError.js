/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow
 * @format
 * @oncall react_native
 */

'use strict';

import type {RevisionId} from '../IncrementalBundler';

class RevisionNotFoundError extends Error {
  revisionId: RevisionId;

  constructor(revisionId: RevisionId) {
    super(`The revision \`${revisionId}\` was not found.`);
    this.revisionId = revisionId;
  }
}

module.exports = RevisionNotFoundError;
