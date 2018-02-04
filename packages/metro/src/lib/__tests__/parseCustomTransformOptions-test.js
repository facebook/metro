/**
 * Copyright (c) 2015-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 *
 * @emails oncall+javascript_foundation
 * @format
 * @flow
 */

'use strict';

const parseCustomTransformOptions = require('../parseCustomTransformOptions');
const url = require('url');

it('should parse some custom options from a http url', () => {
  const myUrl =
    'http://localhost/my/bundle.bundle?dev=true&transform.foo=value&transform.bar=other';

  expect(parseCustomTransformOptions(url.parse(myUrl, true))).toEqual({
    foo: 'value',
    bar: 'other',
  });
});

it('should parse some custom options from a websocket url', () => {
  const myUrl = 'ws://localhost/hot?transform.foo=value&transform.bar=other';

  expect(parseCustomTransformOptions(url.parse(myUrl, true))).toEqual({
    foo: 'value',
    bar: 'other',
  });
});

it('should return an empty object if there are no custom params', () => {
  const myUrl = 'http://localhost/my/bundle.bundle?dev=true';

  expect(parseCustomTransformOptions(url.parse(myUrl, true))).toEqual({});
});
