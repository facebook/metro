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
          bytecode: false,
          dev: true,
          hot: true,
          minify: true,
          type: 'module',
          platform: 'web',
        },
        {shallow: false, experimentalImportBundleSupport: false},
      ),
    ).not.toBe(
      getGraphId(
        '/root/notmuch',
        {
          bytecode: false,
          dev: true,
          hot: true,
          minify: true,
          type: 'module',
          platform: 'web',
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
          bytecode: false,
          dev: true,
          hot: true,
          minify: true,
          type: 'module',
          platform: 'web',
        },
        {shallow: false, experimentalImportBundleSupport: false},
      ),
    ).not.toBe(
      getGraphId(
        '/root/waddup',
        {
          bytecode: false,
          dev: false,
          hot: true,
          minify: true,
          type: 'module',
          platform: 'web',
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
          bytecode: false,
          dev: true,
          hot: true,
          minify: true,
          type: 'module',
          platform: 'web',
        },
        {shallow: false, experimentalImportBundleSupport: false},
      ),
    ).toBe(
      getGraphId(
        '/root/waddup',
        {
          bytecode: false,
          type: 'module',
          platform: 'web',
          hot: true,
          dev: true,
          minify: true,
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
          bytecode: false,
          customTransformOptions: {
            a: true,
            b: false,
          },
          dev: true,
          hot: true,
          minify: true,
          type: 'module',
          platform: 'web',
        },
        {shallow: false, experimentalImportBundleSupport: false},
      ),
    ).toBe(
      getGraphId(
        '/root/waddup',
        {
          bytecode: false,
          customTransformOptions: {
            b: false,
            a: true,
          },
          dev: true,
          hot: true,
          minify: true,
          type: 'module',
          platform: 'web',
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
          bytecode: false,
          customTransformOptions: undefined,
          experimentalImportSupport: false,
          dev: true,
          hot: true,
          minify: true,
          type: 'module',
          platform: null,
        },
        {shallow: false, experimentalImportBundleSupport: false},
      ),
    ).toBe(
      getGraphId(
        '/root/waddup',
        {
          bytecode: false,
          dev: true,
          hot: true,
          minify: true,
          type: 'module',
          platform: undefined,
        },
        {shallow: false, experimentalImportBundleSupport: false},
      ),
    );
  });
});
