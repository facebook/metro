/**
 * Copyright (c) 2016-present, Facebook, Inc.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @format
 * @emails oncall+js_foundation
 */

'use strict';

const removeInlineRequiresBlacklistFromOptions = require('../removeInlineRequiresBlacklistFromOptions');

it('should not touch a transformOption object with boolean inlineRequires', () => {
  const transformOptions = {
    inlineRequires: false,
  };

  expect(
    removeInlineRequiresBlacklistFromOptions('/path', transformOptions),
  ).toBe(transformOptions);
});

it('should change inlineRequires to true when the path is not in the blacklist', () => {
  const transformOptions = {
    inlineRequires: {
      blacklist: {'/other': true},
    },
    foo: 'bar',
  };

  expect(
    removeInlineRequiresBlacklistFromOptions('/path', transformOptions),
  ).toEqual({
    inlineRequires: true,
    foo: 'bar',
  });
});

it('should change inlineRequires to false when the path is in the blacklist', () => {
  const transformOptions = {
    inlineRequires: {
      blacklist: {'/path': true},
    },
    foo: 'bar',
  };

  expect(
    removeInlineRequiresBlacklistFromOptions('/path', transformOptions),
  ).toEqual({
    inlineRequires: false,
    foo: 'bar',
  });
});
