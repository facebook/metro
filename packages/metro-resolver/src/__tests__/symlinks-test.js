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

import type {ResolutionContext} from '../index';

import {createResolutionContext} from './utils';

const FailedToResolvePathError = require('../errors/FailedToResolvePathError');
const Resolver = require('../index');

const fileMap = {
  '/root/project/foo.js': '',
  '/root/project/baz/index.js': '',
  '/root/project/baz.js': {realPath: null},
  '/root/project/link-to-foo.js': {realPath: '/root/project/foo.js'},
};

const CONTEXT: ResolutionContext = {
  ...createResolutionContext(fileMap),
  originModulePath: '/root/project/foo.js',
};

test('resolves to a real path when the chosen candidate is a symlink', () => {
  expect(Resolver.resolve(CONTEXT, './link-to-foo', null)).toEqual({
    type: 'sourceFile',
    filePath: '/root/project/foo.js',
  });
});

test('does not resolve to a broken symlink', () => {
  // ./baz.js is a broken link, baz/index.js is real
  expect(() => Resolver.resolve(CONTEXT, './baz.js', null)).toThrow(
    FailedToResolvePathError,
  );
  expect(Resolver.resolve(CONTEXT, './baz', null)).toEqual({
    type: 'sourceFile',
    filePath: '/root/project/baz/index.js',
  });
});
