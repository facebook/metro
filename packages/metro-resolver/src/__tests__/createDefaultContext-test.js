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

import createDefaultContext from '../createDefaultContext';
import {createResolutionContext, posixToSystemPath as p} from './utils';

const dependency = {
  name: './file',
  data: {key: 'file', asyncType: null, isESMImport: false, locs: []},
};

const context = {
  ...createResolutionContext({[p('/project/file.js')]: ''}),
  originModulePath: p('/project/index.js'),
};

test('preserves a supplied directory opener', () => {
  expect(createDefaultContext(context, dependency).fileSystemOpenDir).toBe(
    context.fileSystemOpenDir,
  );
});

test('supplies directory lookups through fileSystemLookup', () => {
  const {fileSystemOpenDir: _fileSystemOpenDir, ...withoutOpenDir} = context;
  const normalized = createDefaultContext(withoutOpenDir, dependency);
  const opened = normalized.fileSystemOpenDir(p('/project'));
  expect(opened?.realPath).toBe(p('/project'));
  expect(opened?.lookup('file.js')).toEqual(
    context.fileSystemLookup(p('/project/file.js')),
  );
  expect(opened?.lookup('missing.js')).toEqual({exists: false});
  expect(normalized.fileSystemOpenDir(p('/missing'))).toBeNull();
  expect(normalized.fileSystemOpenDir(p('/project/file.js'))).toBeNull();
});
