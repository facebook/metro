/**
 * Copyright (c) 2015-present, Facebook, Inc.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @format
 * @emails oncall+js_foundation
 * @flow
 */

'use strict';

const MapWithDefaults = require('../MapWithDefaults');

describe('MapWithDefaults', function() {
  it('works', () => {
    const map = new MapWithDefaults(() => ['bar']);
    map.get('foo').push('baz');
    expect(map.get('foo')).toEqual(['bar', 'baz']);
  });
});
