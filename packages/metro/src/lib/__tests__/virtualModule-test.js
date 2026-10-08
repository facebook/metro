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

import {
  deriveVirtualModulePath,
  getModuleDisplayPath,
  getModuleSourcePath,
  getModuleUrlPathname,
  isVirtualModulePath,
} from '../virtualModule';

const toUrlPathname = (filePath: string) => '/files' + filePath;

test('a virtual module path is the virtual path in the virtual namespace', () => {
  const modulePath = deriveVirtualModulePath('/root/App.generated.tsx');
  expect(modulePath).toBe('metro-virtual:/root/App.generated.tsx');
  expect(isVirtualModulePath(modulePath)).toBe(true);
  expect(getModuleSourcePath(modulePath)).toBe('/root/App.generated.tsx');
});

test('real module paths pass through unchanged', () => {
  expect(isVirtualModulePath('/root/App.tsx')).toBe(false);
  expect(getModuleSourcePath('/root/App.tsx')).toBe('/root/App.tsx');
  expect(getModuleDisplayPath('/root/src/App.tsx', '/root')).toBe(
    'src/App.tsx',
  );
  expect(getModuleUrlPathname('/root/App.tsx', toUrlPathname)).toBe(
    '/files/root/App.tsx',
  );
});

test('a virtual module is displayed relative to the root, in its namespace', () => {
  expect(
    getModuleDisplayPath('metro-virtual:/root/src/App.generated.tsx', '/root'),
  ).toBe('metro-virtual:src/App.generated.tsx');
});

test('a virtual module URL differs from that of a real file at the same path', () => {
  expect(
    getModuleUrlPathname('metro-virtual:/root/App.tsx', toUrlPathname),
  ).toBe('/[metro-virtual]/files/root/App.tsx');
  expect(
    getModuleUrlPathname('metro-virtual:/root/App.tsx', filePath =>
      filePath.slice('/root/'.length),
    ),
  ).toBe('/[metro-virtual]/App.tsx');
});
