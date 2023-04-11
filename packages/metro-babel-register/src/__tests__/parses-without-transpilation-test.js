/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @oncall react_native
 * @format
 * @flow strict
 */

'use strict';

const {promises: fsPromises} = require('fs');
const vm = require('vm');

it('can be loaded directly without transpilation', async () => {
  const code = await fsPromises.readFile(
    require.resolve('../babel-register'),
    'utf8',
  );
  expect(() => new vm.Script(code)).not.toThrow();
});
