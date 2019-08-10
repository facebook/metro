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

const canonicalize = require('../canonicalize');

describe('canonicalize', () => {
  it('has the same output for two objects with the same key/value pairs', () => {
    expect(
      canonicalize('', {
        a: true,
        b: true,
      }),
    ).toEqual(
      canonicalize('', {
        b: true,
        a: true,
      }),
    );
  });

  it("doesn't have the same output for two objects with different key/value pairs", () => {
    expect(
      canonicalize('', {
        a: true,
        b: true,
      }),
    ).not.toEqual(
      canonicalize('', {
        b: false,
        a: true,
      }),
    );
  });

  it("doesn't affect arrays and primitive values", () => {
    expect(canonicalize('', ['a', true, 0])).toEqual(['a', true, 0]);
    expect(canonicalize('', 'a')).toEqual('a');
    expect(canonicalize('', true)).toEqual(true);
    expect(canonicalize('', 0)).toEqual(0);
  });

  it('works with JSON.stringify', () => {
    expect(
      JSON.stringify(
        {
          a: true,
          b: true,
        },
        canonicalize,
      ),
    ).toBe(
      JSON.stringify(
        {
          b: true,
          a: true,
        },
        canonicalize,
      ),
    );

    expect(
      JSON.stringify(
        {
          a: true,
          b: true,
        },
        canonicalize,
      ),
    ).not.toBe(
      JSON.stringify(
        {
          b: false,
          a: true,
        },
        canonicalize,
      ),
    );
  });

  it('works with JSON.stringify for deeply nested objects', () => {
    expect(
      JSON.stringify(
        {
          a: true,
          b: {
            c: {
              e: true,
              f: true,
            },
            d: true,
          },
        },
        canonicalize,
      ),
    ).toBe(
      JSON.stringify(
        {
          b: {
            d: true,
            c: {
              f: true,
              e: true,
            },
          },
          a: true,
        },
        canonicalize,
      ),
    );

    expect(
      JSON.stringify(
        {
          a: true,
          b: {
            c: {
              e: true,
              f: true,
            },
            d: true,
          },
        },
        canonicalize,
      ),
    ).not.toBe(
      JSON.stringify(
        {
          b: {
            d: true,
            c: {
              f: false,
              e: true,
            },
          },
          a: true,
        },
        canonicalize,
      ),
    );
  });

  it('works with JSON.stringify for objects with no prototype', () => {
    const obj1 = Object.create(null);
    obj1.b = true;
    obj1.a = true;
    const obj2 = Object.create(null);
    obj2.a = true;
    obj2.b = true;

    expect(JSON.stringify(obj1, canonicalize)).toBe(
      JSON.stringify(obj2, canonicalize),
    );
  });
});
