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

'use strict';

import hasSideEffects from '../hasSideEffects';

describe('hasSideEffects', () => {
  const packageRoot = '/repo/pkg';

  test('returns true for undefined sideEffects (conservative default)', () => {
    expect(
      hasSideEffects('/repo/pkg/src/index.js', undefined, packageRoot),
    ).toBe(true);
  });

  test('returns true for sideEffects=true', () => {
    expect(hasSideEffects('/repo/pkg/src/index.js', true, packageRoot)).toBe(
      true,
    );
  });

  test('returns false for sideEffects=false', () => {
    expect(hasSideEffects('/repo/pkg/src/index.js', false, packageRoot)).toBe(
      false,
    );
  });

  test('matches glob arrays (e.g. *.css)', () => {
    expect(
      hasSideEffects('/repo/pkg/src/styles.css', ['**/*.css'], packageRoot),
    ).toBe(true);
    expect(
      hasSideEffects('/repo/pkg/src/utils.js', ['**/*.css'], packageRoot),
    ).toBe(false);
  });

  test('matches patterns with and without ./ prefix', () => {
    expect(
      hasSideEffects(
        '/repo/pkg/src/polyfill.js',
        ['./src/polyfill.js'],
        packageRoot,
      ),
    ).toBe(true);
    expect(
      hasSideEffects(
        '/repo/pkg/src/polyfill.js',
        ['src/polyfill.js'],
        packageRoot,
      ),
    ).toBe(true);
  });
});
