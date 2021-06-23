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

const getGraphId = require('../getGraphId');

describe('getGraphId', () => {
  it('generates a unique id from entry file', () => {
    expect(
      getGraphId(
        '/root/waddup',
        {
          dev: true,
          hot: true,
          minify: true,
          type: 'module',
          platform: 'web',
          runtimeBytecodeVersion: null,
          unstable_transformProfile: 'default',
        },
        {shallow: false, experimentalImportBundleSupport: false},
      ),
    ).not.toBe(
      getGraphId(
        '/root/notmuch',
        {
          dev: true,
          hot: true,
          minify: true,
          type: 'module',
          platform: 'web',
          runtimeBytecodeVersion: null,
          unstable_transformProfile: 'default',
        },
        {shallow: false, experimentalImportBundleSupport: false},
      ),
    );
  });

  it('generates a unique id from transform options', () => {
    expect(
      getGraphId(
        '/root/waddup',
        {
          dev: true,
          hot: true,
          minify: true,
          type: 'module',
          platform: 'web',
          runtimeBytecodeVersion: null,
          unstable_transformProfile: 'default',
        },
        {shallow: false, experimentalImportBundleSupport: false},
      ),
    ).not.toBe(
      getGraphId(
        '/root/waddup',
        {
          dev: false,
          hot: true,
          minify: true,
          type: 'module',
          platform: 'web',
          runtimeBytecodeVersion: null,
          unstable_transformProfile: 'default',
        },
        {shallow: false, experimentalImportBundleSupport: false},
      ),
    );
  });

  it("order of keys in transform options doesn't matter", () => {
    expect(
      getGraphId(
        '/root/waddup',
        {
          dev: true,
          hot: true,
          minify: true,
          type: 'module',
          platform: 'web',
          runtimeBytecodeVersion: null,
          unstable_transformProfile: 'default',
        },
        {shallow: false, experimentalImportBundleSupport: false},
      ),
    ).toBe(
      getGraphId(
        '/root/waddup',
        {
          type: 'module',
          platform: 'web',
          hot: true,
          dev: true,
          minify: true,
          runtimeBytecodeVersion: null,
          unstable_transformProfile: 'default',
        },
        {shallow: false, experimentalImportBundleSupport: false},
      ),
    );
  });

  it("order of keys in custom transform options doesn't matter", () => {
    expect(
      getGraphId(
        '/root/waddup',
        {
          customTransformOptions: {
            a: true,
            b: false,
          },
          dev: true,
          hot: true,
          minify: true,
          type: 'module',
          platform: 'web',
          runtimeBytecodeVersion: null,
          unstable_transformProfile: 'default',
        },
        {shallow: false, experimentalImportBundleSupport: false},
      ),
    ).toBe(
      getGraphId(
        '/root/waddup',
        {
          customTransformOptions: {
            b: false,
            a: true,
          },
          dev: true,
          hot: true,
          minify: true,
          type: 'module',
          platform: 'web',
          runtimeBytecodeVersion: null,
          unstable_transformProfile: 'default',
        },
        {shallow: false, experimentalImportBundleSupport: false},
      ),
    );
  });

  it('optional and nullable options are defaulted', () => {
    expect(
      getGraphId(
        '/root/waddup',
        {
          customTransformOptions: undefined,
          experimentalImportSupport: false,
          dev: true,
          hot: true,
          minify: true,
          type: 'module',
          platform: null,
          runtimeBytecodeVersion: null,
          unstable_transformProfile: 'default',
        },
        {shallow: false, experimentalImportBundleSupport: false},
      ),
    ).toBe(
      getGraphId(
        '/root/waddup',
        {
          dev: true,
          hot: true,
          minify: true,
          type: 'module',
          platform: undefined,
          runtimeBytecodeVersion: null,
          unstable_transformProfile: 'default',
        },
        {shallow: false, experimentalImportBundleSupport: false},
      ),
    );
  });

  it('does not ignore the bytecode option', () => {
    expect(
      getGraphId(
        '/root/waddup',
        {
          dev: true,
          hot: true,
          minify: true,
          platform: 'web',
          type: 'module',
          runtimeBytecodeVersion: 48,
          unstable_transformProfile: 'default',
        },
        {shallow: false, experimentalImportBundleSupport: false},
      ),
    ).not.toBe(
      getGraphId(
        '/root/waddup',
        {
          dev: true,
          hot: true,
          minify: true,
          platform: 'web',
          type: 'module',
          runtimeBytecodeVersion: null,
          unstable_transformProfile: 'default',
        },
        {shallow: false, experimentalImportBundleSupport: false},
      ),
    );
  });
});
