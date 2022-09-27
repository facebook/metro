/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @format
 * @oncall react_native
 * @flow strict
 */

import {planQuery} from '../planQuery';

it('plans a "since" query when a clock and directories are given', () => {
  const {query, queryGenerator} = planQuery({
    since: 'clock',
    directoryFilters: ['/dir1', '/dir2'],
    extensions: ['js', 'ts'],
    includeSha1: true,
  });
  expect(queryGenerator).toBe('since');
  expect(query).toEqual({
    since: 'clock',
    expression: [
      'allof',
      ['type', 'f'],
      ['anyof', ['dirname', '/dir1'], ['dirname', '/dir2']],
      ['suffix', ['js', 'ts']],
    ],
    fields: ['name', 'exists', 'mtime_ms', 'size', 'content.sha1hex'],
  });
});

it('plans a "since" query when a clock but no directories are given', () => {
  const {query, queryGenerator} = planQuery({
    since: 'clock',
    directoryFilters: [],
    extensions: ['js', 'ts'],
    includeSha1: true,
  });
  expect(queryGenerator).toBe('since');
  expect(query).toEqual({
    since: 'clock',
    expression: ['allof', ['type', 'f'], ['anyof'], ['suffix', ['js', 'ts']]],
    fields: ['name', 'exists', 'mtime_ms', 'size', 'content.sha1hex'],
  });
});

it('plans a "glob" query when directories but no clock are given', () => {
  const {query, queryGenerator} = planQuery({
    since: null,
    directoryFilters: ['/dir1', '/dir2'],
    extensions: ['js', 'ts'],
    includeSha1: true,
  });
  expect(queryGenerator).toBe('glob');
  expect(query).toEqual({
    glob: ['/dir1/**', '/dir2/**'],
    glob_includedotfiles: true,
    expression: ['allof', ['type', 'f'], ['suffix', ['js', 'ts']]],
    fields: ['name', 'exists', 'mtime_ms', 'size', 'content.sha1hex'],
  });
});

it('plans a "suffix" query when no clock or directories are given', () => {
  const {query, queryGenerator} = planQuery({
    since: null,
    directoryFilters: [],
    extensions: ['js', 'ts'],
    includeSha1: true,
  });
  expect(queryGenerator).toBe('suffix');
  expect(query).toEqual({
    suffix: ['js', 'ts'],
    expression: ['allof', ['type', 'f']],
    fields: ['name', 'exists', 'mtime_ms', 'size', 'content.sha1hex'],
  });
});

it('does not request content.sha1hex if includeSha1 == false', () => {
  const {query, queryGenerator} = planQuery({
    since: null,
    directoryFilters: [],
    extensions: ['js', 'ts'],
    includeSha1: false,
  });
  expect(queryGenerator).toBe('suffix');
  expect(query).toEqual({
    suffix: ['js', 'ts'],
    expression: ['allof', ['type', 'f']],
    fields: ['name', 'exists', 'mtime_ms', 'size'],
  });
});
