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

let mockPathModule;
jest.mock('node:path', () => mockPathModule);

describe.each(['posix', 'win32'])('filesystem root on %s', platform => {
  beforeEach(() => {
    jest.resetModules();
    mockPathModule = jest.requireActual<{}>('node:path')[platform];
  });

  test.each([true, false])(
    'resolves redirects in the root directory (native opener: %s)',
    useOpenDir => {
      const {resolve} = require('../index');
      const createDefaultContext = require('../createDefaultContext').default;
      const {createResolutionContext} = require('./utils');
      const root = platform === 'win32' ? 'C:\\' : '/';
      const packageJson = {
        browser: {'./foo.ios.js': './replacement.ios.js'},
      };
      const base = createResolutionContext({
        [root + 'origin.js']: '',
        [root + 'package.json']: JSON.stringify(packageJson),
        [root + 'replacement.ios.js']: '',
      });
      const context = createDefaultContext(
        {
          ...base,
          originModulePath: root + 'origin.js',
          fileSystemOpenDir: useOpenDir ? base.fileSystemOpenDir : undefined,
          // The shared mock package accessor stops before the filesystem root.
          getPackageForModule: filePath => ({
            rootPath: root,
            packageJson,
            packageRelativePath: mockPathModule.relative(root, filePath),
          }),
        },
        {
          name: './foo',
          data: {key: 'foo', asyncType: null, isESMImport: false, locs: []},
        },
      );
      const fileSystemLookup = jest.fn(context.fileSystemLookup);
      expect(resolve({...context, fileSystemLookup}, './foo', 'ios')).toEqual({
        type: 'sourceFile',
        filePath: root + 'replacement.ios.js',
      });
      // The redirect stays in the opened root, rather than using a full lookup.
      expect(fileSystemLookup).not.toHaveBeenCalled();
    },
  );
});
