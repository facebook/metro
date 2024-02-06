/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow strict
 * @format
 * @oncall react_native
 */

// $FlowFixMe[unsupported-syntax]
declare module 'ci-info' {
  declare module.exports: {
    isCI: boolean,
    name: string,
    isPR: boolean,
  };
}
