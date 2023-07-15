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

import parseKeyValueParamArray from '../parseKeyValueParamArray';

test('empty', () => {
  expect(parseKeyValueParamArray([])).toEqual({});
});

test('result has nullish prototype', () => {
  // eslint-disable-next-line no-proto
  expect(parseKeyValueParamArray([]).__proto__).toBe(undefined);
});

test('single prop', () => {
  expect(parseKeyValueParamArray(['foo=bar'])).toEqual({
    foo: 'bar',
  });
});

test('repeated prop, last one wins', () => {
  expect(parseKeyValueParamArray(['foo=bar', 'foo=baz'])).toEqual({
    foo: 'baz',
  });
});

test('multiple props', () => {
  expect(parseKeyValueParamArray(['foo=bar', 'baz=quux'])).toEqual({
    foo: 'bar',
    baz: 'quux',
  });
});

test('"&" is not allowed', () => {
  expect(() =>
    parseKeyValueParamArray(['foo=bar&baz=quux']),
  ).toThrowErrorMatchingInlineSnapshot(
    `"Parameter cannot include \\"&\\" but found: foo=bar&baz=quux"`,
  );
});

test('"=" is required', () => {
  expect(() =>
    parseKeyValueParamArray(['foo', 'bar']),
  ).toThrowErrorMatchingInlineSnapshot(
    `"Expected parameter to include \\"=\\" but found: foo"`,
  );
});

test('multiple "=" characters', () => {
  expect(parseKeyValueParamArray(['a=b=c'])).toEqual({a: 'b=c'});
});

test('performs URL decoding', () => {
  expect(parseKeyValueParamArray(['a=b%20c'])).toEqual({a: 'b c'});
  expect(parseKeyValueParamArray(['a=b%26c'])).toEqual({a: 'b&c'});
  expect(parseKeyValueParamArray(['a%3Db=c'])).toEqual({'a=b': 'c'});
});
