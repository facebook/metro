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

import type {CrawlerOptions} from '../../../flow-types';

import TreeFS from '../../../lib/TreeFS';
import watchmanCrawl from '../index';
import EventEmitter from 'events';
import nullthrows from 'nullthrows';
import path from 'path';

class MockClient extends EventEmitter {
  command: JestMockFn<$ReadOnlyArray<$FlowFixMe>, mixed> = jest.fn();
  end: JestMockFn<[], void> = jest.fn();
}
const mockClient = new MockClient();

jest.mock('fb-watchman', () => ({
  Client: jest.fn().mockImplementation(() => mockClient),
}));

// /some/path on posix, c:\some\path on Windows
const systemPath: string => string = filePath =>
  watchmanPath(filePath).replace(/\//g, path.sep);

// /some/path on posix, c:/some/path on Windows. Relative unchanged.
const watchmanPath: string => string = filePath =>
  filePath.replace(/^\//, 'C:/');

const DEFAULT_OPTIONS: CrawlerOptions = {
  abortSignal: null,
  computeSha1: true,
  extensions: ['js'],
  ignore: () => false,
  includeSymlinks: true,
  onStatus: () => {},
  perfLogger: null,
  previousState: {
    clocks: new Map(),
    fileSystem: new TreeFS({rootDir: systemPath('/roots')}),
  },
  rootDir: systemPath('/roots'),
  roots: [
    systemPath('/roots/root1/project1'),
    systemPath('/roots/root2/project2'),
  ],
  forceNodeFilesystemAPI: false,
};

const WATCH_PROJECTS = new Map([
  [
    systemPath('/roots/root1/project1'),
    {
      watch: watchmanPath('/roots/root1'),
      relative_path: watchmanPath('project1'),
    },
  ],
  [
    systemPath('/roots/root2/project2'),
    {
      watch: watchmanPath('/roots/root2'),
      relative_path: watchmanPath('project2'),
    },
  ],
  [
    systemPath('/roots/deep/root3/deeper/project'),
    {
      watch: watchmanPath('/roots/deep/root3'),
      relative_path: watchmanPath('deeper/project'),
    },
  ],
]);

describe('Watchman crawler', () => {
  let expectedQueries: Map<
    string /* watch root */,
    $ReadOnly<{query: mixed, result: mixed}>,
  >;
  beforeEach(() => {
    expectedQueries = new Map();
    mockClient.command.mockImplementation(([cmd, root, ...args], cb) => {
      switch (cmd) {
        case 'watch-project':
          expect(args).toEqual([]);
          expect(WATCH_PROJECTS.has(root)).toBe(true);
          const mockResponse = WATCH_PROJECTS.get(root);
          cb(null, mockResponse);
          break;
        case 'query':
          expect(expectedQueries.has(root)).toBe(true);
          const expectationAndResult = nullthrows(expectedQueries.get(root));
          const {query, result} = expectationAndResult;
          expect(args).toEqual([query]);
          cb(null, result);
          break;
        default:
          throw new Error(`Unexpected command: ${cmd}`);
      }
    });
  });

  test('executes glob queries when there are no matching clocks', async () => {
    expectedQueries = new Map([
      [
        watchmanPath('/roots/root1'),
        {
          query: {
            expression: expect.any(Array),
            fields: expect.any(Array),
            glob: ['project1/**'],
            glob_includedotfiles: true,
          },
          result: {
            clock: 'c:root1:1234',
            files: [],
          },
        },
      ],
      [
        watchmanPath('/roots/root2'),
        {
          query: {
            expression: expect.any(Array),
            fields: expect.any(Array),
            glob: ['project2/**'],
            glob_includedotfiles: true,
          },
          result: {
            clock: 'c:root2:1234',
            files: [],
          },
        },
      ],
    ]);

    const crawlResult = await watchmanCrawl(DEFAULT_OPTIONS);

    expect(crawlResult).toEqual({
      changedFiles: new Map(),
      removedFiles: new Set(),
      clocks: new Map([
        ['root1', 'c:root1:1234'],
        ['root2', 'c:root2:1234'],
      ]),
    });
  });

  test('executes since queries when previousState has matching clocks', async () => {
    expectedQueries = new Map([
      [
        watchmanPath('/roots/root1'),
        {
          query: {
            expression: expect.any(Array),
            fields: expect.any(Array),
            since: 'c:root1:1234',
          },
          result: {
            clock: 'c:root1:5678',
            files: [],
          },
        },
      ],
      [
        watchmanPath('/roots/root2'),
        {
          query: {
            expression: expect.any(Array),
            fields: expect.any(Array),
            glob: ['project2/**'],
            glob_includedotfiles: true,
          },
          result: {
            clock: 'c:root2:1234',
            files: [],
          },
        },
      ],
    ]);

    const crawlResult = await watchmanCrawl({
      ...DEFAULT_OPTIONS,
      previousState: {
        ...DEFAULT_OPTIONS.previousState,
        clocks: new Map([[watchmanPath('root1'), 'c:root1:1234']]),
      },
    });

    expect(crawlResult).toEqual({
      changedFiles: new Map(),
      removedFiles: new Set(),
      clocks: new Map([
        [watchmanPath('root1'), 'c:root1:5678'],
        [watchmanPath('root2'), 'c:root2:1234'],
      ]),
    });
  });

  test('matches and returns posix clock paths', async () => {
    expectedQueries = new Map([
      [
        watchmanPath('/roots/deep/root3'),
        {
          query: {
            expression: expect.any(Array),
            fields: expect.any(Array),
            since: 'c:root3:1234',
          },
          result: {
            clock: 'c:root3:5678',
            files: [],
          },
        },
      ],
    ]);

    const crawlResult = await watchmanCrawl({
      ...DEFAULT_OPTIONS,
      roots: [systemPath('/roots/deep/root3/deeper/project')],
      previousState: {
        ...DEFAULT_OPTIONS.previousState,
        clocks: new Map([[watchmanPath('deep/root3'), 'c:root3:1234']]),
      },
    });

    expect(crawlResult).toEqual({
      changedFiles: new Map(),
      removedFiles: new Set(),
      clocks: new Map([[watchmanPath('deep/root3'), 'c:root3:5678']]),
    });
  });
});
