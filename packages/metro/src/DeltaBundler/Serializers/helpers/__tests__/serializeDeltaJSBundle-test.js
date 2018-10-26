/**
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @emails oncall+javascript_foundation
 * @flow
 * @format
 */

'use strict';

const serializeDeltaJSBundle = require('../serializeDeltaJSBundle');

const deltaBundle = {
  id: 'arbitrary ID',
  pre: [[-1, 'arbitrary pre string'], [-2, 'arbitrary pre string']],
  post: [[-3, 'arbitrary post string'], [-4, 'arbitrary post string']],
  delta: [
    [11, 'arbitrary module source'],
    [1111, null],
    [111111, 'arbitrary module source 2'],
    [11111111, null],
  ],
  reset: true,
};

it('can serialize to a string', () => {
  expect(serializeDeltaJSBundle.toJSON(deltaBundle)).toEqual(
    JSON.stringify(deltaBundle),
  );
});
