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

const BYTECODE_VERSION = 48;

const parseOptionsFromUrl = require('../parseOptionsFromUrl');

describe('parseOptionsFromUrl', () => {
  it.each([['map'], ['bundle']])('detects %s requests', type => {
    expect(
      parseOptionsFromUrl(
        `http://localhost/my/bundle.${type}`,
        new Set([]),
        BYTECODE_VERSION,
      ),
    ).toMatchObject({bundleType: type});
  });

  it('retrieves the platform from the query parameters', () => {
    expect(
      parseOptionsFromUrl(
        'http://localhost/my/bundle.bundle?platform=ios',
        new Set([]),
        BYTECODE_VERSION,
      ),
    ).toMatchObject({platform: 'ios'});
  });

  it('retrieves the platform from the pathname', () => {
    expect(
      parseOptionsFromUrl(
        'http://localhost/my/bundle.test.bundle',
        new Set(['test']),
        BYTECODE_VERSION,
      ),
    ).toMatchObject({platform: 'test'});
  });

  it('infers the source map url from the pathname', () => {
    expect(
      parseOptionsFromUrl(
        'http://localhost/my/bundle.bundle',
        new Set([]),
        BYTECODE_VERSION,
      ),
    ).toMatchObject({sourceMapUrl: '//localhost/my/bundle.map'});
  });

  it('forces the HTTP protocol for iOS and Android platforms', () => {
    expect(
      parseOptionsFromUrl(
        'http://localhost/my/bundle.bundle?platform=ios',
        new Set(['ios']),
        BYTECODE_VERSION,
      ),
    ).toMatchObject({
      sourceMapUrl: 'http://localhost/my/bundle.map?platform=ios',
    });

    expect(
      parseOptionsFromUrl(
        'http://localhost/my/bundle.bundle?platform=android',
        new Set(['android']),
        BYTECODE_VERSION,
      ),
    ).toMatchObject({
      sourceMapUrl: 'http://localhost/my/bundle.map?platform=android',
    });
  });

  it('always sets the `hot` option to `true`', () => {
    expect(
      parseOptionsFromUrl(
        'http://localhost/my/bundle.bundle',
        new Set([]),
        BYTECODE_VERSION,
      ),
    ).toMatchObject({hot: true});
  });

  it('retrieves stuff from HMR urls', () => {
    expect(
      parseOptionsFromUrl('my/bundle.bundle', new Set([]), BYTECODE_VERSION),
    ).toMatchObject({
      entryFile: './my/bundle',
    });
  });

  it('parses the `runtimeBytecodeVersion` as a number', () => {
    expect(
      parseOptionsFromUrl(
        'http://localhost/my/bundle.bundle',
        new Set([]),
        BYTECODE_VERSION,
      ),
    ).toMatchObject({runtimeBytecodeVersion: null});

    expect(
      parseOptionsFromUrl(
        'http://localhost/my/bundle.bundle?runtimeBytecodeVersion=48',
        new Set([]),
        BYTECODE_VERSION,
      ),
    ).toMatchObject({runtimeBytecodeVersion: BYTECODE_VERSION});

    expect(
      parseOptionsFromUrl(
        'http://localhost/my/bundle.bundle?runtimeBytecodeVersion=true',
        new Set([]),
        BYTECODE_VERSION,
      ),
    ).toMatchObject({runtimeBytecodeVersion: null});

    // Do not use bytecode if the version is incompatible.
    expect(
      parseOptionsFromUrl(
        'http://localhost/my/bundle.bundle?runtimeBytecodeVersion=47',
        new Set([]),
        BYTECODE_VERSION,
      ),
    ).toMatchObject({runtimeBytecodeVersion: null});
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
          new Set([]),
          BYTECODE_VERSION,
        ),
      ).toMatchObject({[optionName]: defaultValue});
    });

    it('is retrieved from the url', () => {
      expect(
        parseOptionsFromUrl(
          `http://localhost/my/bundle.bundle?${optionName}=true`,
          new Set([]),
          BYTECODE_VERSION,
        ),
      ).toMatchObject({[optionName]: true});

      expect(
        parseOptionsFromUrl(
          `http://localhost/my/bundle.bundle?${optionName}=false`,
          new Set([]),
          BYTECODE_VERSION,
        ),
      ).toMatchObject({[optionName]: false});
    });
  });
});
