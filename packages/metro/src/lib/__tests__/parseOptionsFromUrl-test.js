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

import parseOptionsFromUrl from '../parseOptionsFromUrl';

describe('parseOptionsFromUrl', () => {
  test.each([['map'], ['bundle']])('detects %s requests', type => {
    expect(
      parseOptionsFromUrl(`http://localhost/my/bundle.${type}`, new Set([])),
    ).toMatchObject({bundleType: type});
  });

  test('retrieves the platform from the query parameters', () => {
    expect(
      parseOptionsFromUrl(
        'http://localhost/my/bundle.bundle?platform=ios',
        new Set([]),
      ),
    ).toMatchObject({platform: 'ios'});
  });

  test('retrieves the platform from the pathname', () => {
    expect(
      parseOptionsFromUrl(
        'http://localhost/my/bundle.test.bundle',
        new Set(['test']),
      ),
    ).toMatchObject({platform: 'test'});
  });

  test('infers the source map url from the pathname', () => {
    expect(
      parseOptionsFromUrl('http://localhost/my/bundle.bundle', new Set([])),
    ).toMatchObject({sourceMapUrl: '//localhost/my/bundle.map'});
  });

  test('forces the HTTP protocol for iOS and Android platforms', () => {
    expect(
      parseOptionsFromUrl(
        'http://localhost/my/bundle.bundle?platform=ios',
        new Set(['ios']),
      ),
    ).toMatchObject({
      sourceMapUrl: 'http://localhost/my/bundle.map?platform=ios',
    });

    expect(
      parseOptionsFromUrl(
        'http://localhost/my/bundle.bundle?platform=android',
        new Set(['android']),
      ),
    ).toMatchObject({
      sourceMapUrl: 'http://localhost/my/bundle.map?platform=android',
    });
  });

  test('always sets the `hot` option to `true`', () => {
    expect(
      parseOptionsFromUrl('http://localhost/my/bundle.bundle', new Set([])),
    ).toMatchObject({hot: true});
  });

  test('retrieves stuff from HMR urls', () => {
    expect(parseOptionsFromUrl('my/bundle.bundle', new Set([]))).toMatchObject({
      entryFile: './my/bundle',
    });
  });

  describe.each([
    ['dev', true],
    ['minify', false],
    ['excludeSource', false],
    ['inlineSourceMap', false],
    ['runModule', true],
  ])('boolean option `%s`', (optionName, defaultValue) => {
    test(`defaults to \`${String(defaultValue)}\``, () => {
      expect(
        parseOptionsFromUrl('http://localhost/my/bundle.bundle', new Set([])),
      ).toMatchObject({[optionName]: defaultValue});
    });

    test('is retrieved from the url', () => {
      expect(
        parseOptionsFromUrl(
          `http://localhost/my/bundle.bundle?${optionName}=true`,
          new Set([]),
        ),
      ).toMatchObject({[optionName]: true});

      expect(
        parseOptionsFromUrl(
          `http://localhost/my/bundle.bundle?${optionName}=false`,
          new Set([]),
        ),
      ).toMatchObject({[optionName]: false});
    });
  });
});
