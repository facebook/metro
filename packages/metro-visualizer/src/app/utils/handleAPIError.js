/**
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @format
 */

/* eslint-env browser */

'use strict';

function handleAPIError(response) {
  if (!response.ok) {
    return response.text().then(error => {
      throw new Error(error);
    });
  }
  return response;
}

module.exports = handleAPIError;
