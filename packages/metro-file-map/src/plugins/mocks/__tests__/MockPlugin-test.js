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

import type MockMapType from '../../MockPlugin';

let mockPathModule;
jest.mock('path', () => mockPathModule);

describe.each([['win32'], ['posix']])('MockMap on %s', platform => {
  const p: string => string = filePath =>
    platform === 'win32'
      ? filePath.replace(/\//g, '\\').replace(/^\\/, 'C:\\')
      : filePath;

  let MockMap: Class<MockMapType>;

  const opts = {
    console,
    mocksPattern: /__mocks__[\/\\].+\.(js|json)$/,
    rootDir: p('/root'),
    throwOnModuleCollision: true,
  };

  beforeEach(() => {
    jest.resetModules();
    mockPathModule = jest.requireActual<{}>('path')[platform];
    MockMap = require('../../MockPlugin').default;
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    jest.clearAllMocks();
  });

  test('set and get a mock module', () => {
    const mockMap = new MockMap(opts);
    mockMap.onNewOrModifiedFile(p('__mocks__/foo.js'));
    expect(mockMap.getMockModule('foo')).toBe(p('/root/__mocks__/foo.js'));
  });

  test('assertValid throws on duplicates', () => {
    const mockMap = new MockMap(opts);
    mockMap.onNewOrModifiedFile(p('__mocks__/foo.js'));
    mockMap.onNewOrModifiedFile(p('other/__mocks__/foo.js'));

    expect(console.warn).toHaveBeenCalledTimes(1);
    expect(() => mockMap.assertValid()).toThrowError(
      `Mock map has 1 error:
Duplicate manual mock found for \`foo\`:
    * <rootDir>/../../__mocks__/foo.js
    * <rootDir>/../../other/__mocks__/foo.js
`.replaceAll('/', mockPathModule.sep),
    );
  });

  test('recovers from duplicates', () => {
    const mockMap = new MockMap(opts);
    mockMap.onNewOrModifiedFile(p('__mocks__/foo.js'));
    mockMap.onNewOrModifiedFile(p('other/__mocks__/foo.js'));

    expect(() => mockMap.assertValid()).toThrow();

    // Latest mock wins
    expect(mockMap.getMockModule('foo')).toBe(
      p('/root/other/__mocks__/foo.js'),
    );

    expect(mockMap.getSerializableSnapshot()).toEqual({
      mocks: new Map([['foo', p('other/__mocks__/foo.js')]]),
      duplicates: new Map([
        ['foo', new Set([p('other/__mocks__/foo.js'), p('__mocks__/foo.js')])],
      ]),
      version: 1,
    });

    mockMap.onRemovedFile(p('other/__mocks__/foo.js'));

    expect(() => mockMap.assertValid()).not.toThrow();

    // Recovery after the latest mock is deleted
    expect(mockMap.getMockModule('foo')).toBe(p('/root/__mocks__/foo.js'));

    expect(mockMap.getSerializableSnapshot()).toEqual({
      mocks: new Map([['foo', p('__mocks__/foo.js')]]),
      duplicates: new Map(),
      version: 1,
    });
  });
});
