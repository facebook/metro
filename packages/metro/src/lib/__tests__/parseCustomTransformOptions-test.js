/**
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @emails oncall+metro_bundler
 * @format
 * @flow strict-local
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
