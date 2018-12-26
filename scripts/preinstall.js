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

if (process.env.NPM_TOKEN) {
  console.error(
    [
      'yarn has been executed with a NPM_TOKEN environment variable set. ',
      'This poses a risk since that token can be leaked to external libraries. ',
      'Please make sure that any token gets deleted before running yarn.',
    ].join('\n'),
  );
  process.exit(1);
}
