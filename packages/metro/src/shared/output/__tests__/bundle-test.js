/**
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @format
 * @emails oncall+js_foundation
 * @flow
 */

'use strict';

jest.mock(
  '../../../Server',
  () =>
    class MockServer {
      build() {
        return Promise.resolve({code: 'code', map: '{"ast":"some code"}'});
      }
    },
);

const bundle = require('../bundle');
const Server = require('../../../Server');
const {getDefaultValues} = require('metro-config/src/defaults');
const config = getDefaultValues('/');
const requestOptions = {
  entryFile: 'test',
  minify: false,
  platform: 'ios',
};

it('should succeed', async () => {
  expect(
    await bundle.build(new Server(config), {...requestOptions}),
  ).toMatchSnapshot();
});

it('should call postProcessBundleSourcemap', async () => {
  const postProcessBundleSourcemap = jest.fn(({code, map}) => ({
    code: `modified ${code}`,
    map,
  }));
  expect(
    await bundle.build(new Server(config), {
      ...requestOptions,
      postProcessBundleSourcemap,
    }),
  ).toMatchSnapshot();
  expect(postProcessBundleSourcemap).toBeCalled();
});
