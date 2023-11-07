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
          unstable_transformProfile: 'default',
        },
        {
          shallow: false,
          lazy: false,
          unstable_allowRequireContext: false,
          resolverOptions: {
            dev: true,
          },
        },
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
          unstable_transformProfile: 'default',
        },
        {
          shallow: false,
          lazy: false,
          unstable_allowRequireContext: false,
          resolverOptions: {
            dev: true,
          },
        },
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
          unstable_transformProfile: 'default',
        },
        {
          shallow: false,
          lazy: false,
          unstable_allowRequireContext: false,
          resolverOptions: {
            dev: true,
          },
        },
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
          unstable_transformProfile: 'default',
        },
        {
          shallow: false,
          lazy: false,
          unstable_allowRequireContext: false,
          resolverOptions: {
            dev: true,
          },
        },
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
          unstable_transformProfile: 'default',
        },
        {
          shallow: false,
          lazy: false,
          unstable_allowRequireContext: false,
          resolverOptions: {
            dev: true,
          },
        },
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
          unstable_transformProfile: 'default',
        },
        {
          shallow: false,
          lazy: false,
          unstable_allowRequireContext: false,
          resolverOptions: {
            dev: true,
          },
        },
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
          unstable_transformProfile: 'default',
        },
        {
          shallow: false,
          lazy: false,
          unstable_allowRequireContext: false,
          resolverOptions: {
            dev: true,
          },
        },
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
          unstable_transformProfile: 'default',
        },
        {
          shallow: false,
          lazy: false,
          unstable_allowRequireContext: false,
          resolverOptions: {
            dev: true,
          },
        },
      ),
    );
  });

  it('generates different graph IDs for different custom resolver options', () => {
    const transformOptions = {
      customTransformOptions: {},
      dev: true,
      hot: true,
      minify: true,
      type: 'module',
      platform: 'web',
      unstable_transformProfile: 'default',
    };
    expect(
      getGraphId('/root/waddup', transformOptions, {
        shallow: false,
        lazy: false,
        unstable_allowRequireContext: false,
        resolverOptions: {
          customResolverOptions: {
            foo: 'bar',
          },
          dev: true,
        },
      }),
    ).not.toBe(
      getGraphId('/root/waddup', transformOptions, {
        shallow: false,
        lazy: false,
        unstable_allowRequireContext: false,
        resolverOptions: {
          customResolverOptions: {
            something: 'else',
          },
          dev: true,
        },
      }),
    );
  });

  it("order of keys in custom resolver options doesn't matter", () => {
    const transformOptions = {
      customTransformOptions: {},
      dev: true,
      hot: true,
      minify: true,
      type: 'module',
      platform: 'web',
      unstable_transformProfile: 'default',
    };
    expect(
      getGraphId('/root/waddup', transformOptions, {
        shallow: false,
        lazy: false,
        unstable_allowRequireContext: false,
        resolverOptions: {
          customResolverOptions: {
            a: true,
            b: false,
          },
          dev: true,
        },
      }),
    ).toBe(
      getGraphId('/root/waddup', transformOptions, {
        shallow: false,
        lazy: false,
        unstable_allowRequireContext: false,
        resolverOptions: {
          customResolverOptions: {
            b: false,
            a: true,
          },
          dev: true,
        },
      }),
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
          unstable_transformProfile: 'default',
        },
        {
          shallow: false,
          lazy: false,
          unstable_allowRequireContext: false,
          resolverOptions: {
            customResolverOptions: undefined,
            dev: true,
          },
        },
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
          unstable_transformProfile: 'default',
        },
        {
          shallow: false,
          lazy: false,
          unstable_allowRequireContext: false,
          resolverOptions: {
            dev: true,
          },
        },
      ),
    );
  });
});
