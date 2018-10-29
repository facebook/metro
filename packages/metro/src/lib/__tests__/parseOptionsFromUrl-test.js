/**
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @emails oncall+javascript_foundation
 * @format
 * @flow strict-local
 */

'use strict';

const parseOptionsFromUrl = require('../parseOptionsFromUrl');

jest.mock('../parseCustomTransformOptions', () => () => ({}));

describe('parseOptionsFromUrl', () => {
  it.each([['map'], ['delta'], ['bundle']])('detects %s requests', type => {
    expect(
      parseOptionsFromUrl(
        `http://localhost/my/bundle.${type}`,
        '/',
        new Set([]),
      ).options,
    ).toMatchObject({bundleType: type});
  });

  it('resolves the entry file from the project root', () => {
    expect(
      parseOptionsFromUrl(
        'http://localhost/my/bundle.bundle.includeRequire.runModule.assets',
        '/static/bundles/',
        new Set([]),
      ).options,
    ).toMatchObject({entryFile: '/static/bundles/my/bundle.js'});
  });

  it('removes extraneous options from the pathname', () => {
    expect(
      parseOptionsFromUrl(
        'http://localhost/my/bundle.bundle.includeRequire.runModule.assets',
        '/',
        new Set([]),
      ).options,
    ).toMatchObject({entryFile: '/my/bundle.js'});
  });

  it('retrieves the platform from the query parameters', () => {
    expect(
      parseOptionsFromUrl(
        'http://localhost/my/bundle.bundle?platform=ios',
        '/',
        new Set([]),
      ).options,
    ).toMatchObject({platform: 'ios'});
  });

  it('retrieves the platform from the pathname', () => {
    expect(
      parseOptionsFromUrl(
        'http://localhost/my/bundle.test.bundle',
        '/',
        new Set(['test']),
      ).options,
    ).toMatchObject({platform: 'test'});
  });

  it('retrieves the revision id from the url', () => {
    expect(
      parseOptionsFromUrl(
        'http://localhost/my/bundle.delta?revisionId=XXX',
        '/',
        new Set([]),
      ),
    ).toMatchObject({revisionId: 'XXX'});

    expect(
      parseOptionsFromUrl(
        'http://localhost/my/bundle.delta?deltaBundleId=XXX',
        '/',
        new Set([]),
      ),
    ).toMatchObject({revisionId: 'XXX'});
  });

  it('infers the source map url from the pathname', () => {
    expect(
      parseOptionsFromUrl('http://localhost/my/bundle.bundle', '/', new Set([]))
        .options,
    ).toMatchObject({sourceMapUrl: '//localhost/my/bundle.map'});

    expect(
      parseOptionsFromUrl('http://localhost/my/bundle.delta', '/', new Set([]))
        .options,
    ).toMatchObject({sourceMapUrl: '//localhost/my/bundle.map'});
  });

  it('always sets the `hot` option to `true`', () => {
    expect(
      parseOptionsFromUrl('http://localhost/my/bundle.bundle', '/', new Set([]))
        .options,
    ).toMatchObject({hot: true});
  });

  describe.each([
    ['dev', true],
    ['minify', false],
    ['excludeSource', false],
    ['inlineSourceMap', false],
    ['runModule', true],
  ])('boolean option `%s`', (optionName, defaultValue) => {
    it(`defaults to \`${String(defaultValue)}\``, () => {
      expect(
        parseOptionsFromUrl(
          'http://localhost/my/bundle.bundle',
          '/',
          new Set([]),
        ).options,
      ).toMatchObject({[optionName]: defaultValue});
    });

    it('is retrieved from the url', () => {
      expect(
        parseOptionsFromUrl(
          `http://localhost/my/bundle.bundle?${optionName}=true`,
          '/',
          new Set([]),
        ).options,
      ).toMatchObject({[optionName]: true});

      expect(
        parseOptionsFromUrl(
          `http://localhost/my/bundle.bundle?${optionName}=false`,
          '/',
          new Set([]),
        ).options,
      ).toMatchObject({[optionName]: false});
    });
  });
});
