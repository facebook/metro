/**
 * Copyright (c) 2016-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
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
