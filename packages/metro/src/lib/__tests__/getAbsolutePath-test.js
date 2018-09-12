/**
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @emails oncall+javascript_foundation
 * @format
 */

'use strict';

jest.mock('fs', () => new (require('metro-memory-fs'))());

const fs = require('fs');
const getAbsolutePath = require('../getAbsolutePath');
const mkdirp = require('mkdirp');

beforeEach(() => {
  fs.reset();

  mkdirp.sync('/root/a');
  mkdirp.sync('/root/b');
  mkdirp.sync('/root/a/d');
});

it('should work for a simple case with a single project root', () => {
  fs.writeFileSync('/root/a/entryPoint.js', '');

  expect(getAbsolutePath('entryPoint.js', ['/root/a'])).toEqual(
    '/root/a/entryPoint.js',
  );
});

it('should resolve from the first defined project root', () => {
  fs.writeFileSync('/root/a/entryPoint.js', '');
  fs.writeFileSync('/root/b/entryPoint.js', '');

  expect(getAbsolutePath('entryPoint.js', ['/root/a', '/root/c'])).toEqual(
    '/root/a/entryPoint.js',
  );
});

it('should resolve from sub-folders', () => {
  fs.writeFileSync('/root/a/d/entryPoint.js', '');
  fs.writeFileSync('/root/b/entryPoint.js', '');

  expect(getAbsolutePath('d/entryPoint.js', ['/root/a', '/root/d'])).toEqual(
    '/root/a/d/entryPoint.js',
  );
});

it('should throw an error if not found', () => {
  expect(() =>
    getAbsolutePath('entryPoint.js', ['/root/a', '/root/d']),
  ).toThrow();
});
