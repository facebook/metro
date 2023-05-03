/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow strict-local
 * @format
 * @oncall react_native
 */

const {normalizeJscUrl, toJscUrl} = require('../jscUrlUtils');

describe('normalizeJscUrl', () => {
  test.each([
    [
      '/path1/path2;&foo=bar?bar=baz#frag?',
      '/path1/path2?foo=bar&bar=baz#frag?',
    ],
    [
      'relative/path;&foo=bar?bar=baz#frag?',
      'relative/path?foo=bar&bar=baz#frag?',
    ],
    [
      'https://user;&:password;&@mydomain.com:8080/path1/path2;&foo=bar?bar=baz#frag?',
      'https://user%3B&:password%3B&@mydomain.com:8080/path1/path2?foo=bar&bar=baz#frag?',
    ],
    [
      'http://127.0.0.1/path1/path2;&foo=bar&bar=baz',
      'http://127.0.0.1/path1/path2?foo=bar&bar=baz',
    ],
  ])('rewrites urls treating ;& in paths as ? (%s => %s)', (input, output) => {
    expect(normalizeJscUrl(input)).toEqual(output);
  });

  test.each([
    ['http://user;&:password;&@mydomain.com/foo?bar=zoo?baz=quux;&'],
    ['/foo?bar=zoo?baz=quux'],
    ['proto:arbitrary_bad_url'],
    ['*'],
    ['relative/path'],
  ])('returns other strings exactly as given (%s)', input => {
    expect(normalizeJscUrl(input)).toEqual(input);
  });
});

describe('toJscUrl', () => {
  test.each([
    [
      'https://user;&:password;&@mydomain.com:8080/path1/path2?foo=bar&bar=question?#frag?',
      'https://user%3B&:password%3B&@mydomain.com:8080/path1/path2;&foo=bar&bar=question%3F#frag?',
    ],
    [
      'http://127.0.0.1/path1/path2?foo=bar',
      'http://127.0.0.1/path1/path2;&foo=bar',
    ],
    ['*', '*'],
    ['/absolute/path', '/absolute/path'],
    ['relative/path', 'relative/path'],
    ['http://127.0.0.1/path1/path', 'http://127.0.0.1/path1/path'],
    [
      '/path1/path2?foo=bar&bar=question?#frag?',
      '/path1/path2;&foo=bar&bar=question%3F#frag?',
    ],
    [
      'relative/path?foo=bar&bar=question?#frag?',
      'relative/path;&foo=bar&bar=question%3F#frag?',
    ],
  ])(
    'replaces the first ? with a JSC-friendly delimeter, url-encodes subsequent ? (%s => %s)',
    (input, output) => {
      expect(toJscUrl(input)).toEqual(output);
    },
  );
});
