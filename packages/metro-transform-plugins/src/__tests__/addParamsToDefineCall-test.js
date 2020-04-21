/**
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @format
 * @emails oncall+js_foundation
 * @flow strict
 */

'use strict';

const addParamsToDefineCall = require('../addParamsToDefineCall');

describe('addParamsToDefineCall', () => {
  const input = '__d(function() {}); // SourceMapUrl=something';

  it('adds a simple parameter', () => {
    expect(addParamsToDefineCall(input, 10)).toEqual(
      '__d(function() {},10); // SourceMapUrl=something',
    );
  });

  it('adds several parameters', () => {
    expect(addParamsToDefineCall(input, 10, {foo: 'bar'})).toEqual(
      '__d(function() {},10,{"foo":"bar"}); // SourceMapUrl=something',
    );
  });

  it('adds null parameters', () => {
    expect(addParamsToDefineCall(input, null, 10)).toEqual(
      '__d(function() {},null,10); // SourceMapUrl=something',
    );
  });

  it('adds undefined parameters', () => {
    expect(addParamsToDefineCall(input, null, 10)).toEqual(
      '__d(function() {},null,10); // SourceMapUrl=something',
    );
  });
});
