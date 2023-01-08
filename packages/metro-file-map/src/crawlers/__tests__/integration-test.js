/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @format
 * @flow strict-local
 * @oncall react_native
 */

import nodeCrawl from '../node';
import watchmanCrawl from '../watchman';
import {execSync} from 'child_process';
import invariant from 'invariant';
import os from 'os';
import {join} from 'path';

// At runtime we use a more sophisticated + robust Watchman capability check,
// but this simple heuristic is fast to check, synchronous (we can't
// asynchronously skip tests: https://github.com/facebook/jest/issues/8604),
// and will tend to exercise our Watchman tests whenever possible.
const isWatchmanOnPath = () => {
  try {
    execSync(
      os.platform() === 'win32' ? 'where.exe /Q watchman' : 'which watchman',
    );
    return true;
  } catch {
    return false;
  }
};

const mockUseNativeFind = jest.fn();
jest.mock('../node/hasNativeFindSupport', () => () => mockUseNativeFind());

type Crawler = typeof nodeCrawl | typeof watchmanCrawl;

const CRAWLERS: {[key: string]: ?Crawler} = {
  'node-find': opts => {
    mockUseNativeFind.mockResolvedValue(true);
    return nodeCrawl(opts);
  },
  'node-recursive': opts => {
    mockUseNativeFind.mockResolvedValue(false);
    return nodeCrawl(opts);
  },
  watchman: isWatchmanOnPath() ? watchmanCrawl : null,
};

const FIXTURES_DIR = join(__dirname, '..', '__fixtures__');

// Crawlers may return the target for symlinks *if* they can do so efficiently,
// (Watchman with symlink_target), but otherwise they should return 1 and
// defer to the caller. This matcher helps with nested expectations.
declare var expect: {...expect, oneOf: () => {}};
function oneOf(this: $FlowFixMe, actual: mixed, ...expectOneOf: mixed[]) {
  const pass = expectOneOf.includes(actual);
  return {
    pass,
    message: () =>
      `expected ${this.utils.printReceived(actual)}${
        pass ? ' not' : ''
      } to be in ${this.utils.printExpected(expectOneOf)}`,
  };
}
expect.extend({oneOf});

const CASES = [
  [
    true,
    new Map([
      ['foo.js', ['', expect.any(Number), 245, 0, '', null, 0]],
      [
        join('directory', 'bar.js'),
        ['', expect.any(Number), 245, 0, '', null, 0],
      ],
      [
        'link-to-directory',
        ['', expect.any(Number), 9, 0, '', null, expect.oneOf(1, 'directory')],
      ],
      [
        'link-to-foo.js',
        ['', expect.any(Number), 6, 0, '', null, expect.oneOf(1, 'foo.js')],
      ],
    ]),
  ],
  [
    false,
    new Map([
      [
        join('directory', 'bar.js'),
        ['', expect.any(Number), 245, 0, '', null, 0],
      ],
      ['foo.js', ['', expect.any(Number), 245, 0, '', null, 0]],
    ]),
  ],
];

describe.each(Object.keys(CRAWLERS))(
  'Crawler integration tests (%s)',
  crawlerName => {
    const crawl = CRAWLERS[crawlerName];
    const maybeTest = crawl ? test : test.skip;

    // $FlowFixMe[prop-missing]: Add each to to test.skip
    maybeTest.each(CASES)(
      'Finds the expected files (includeSymlinks: %s)',
      async (includeSymlinks, expectedChangedFiles) => {
        invariant(crawl, 'crawl should not be null within maybeTest');
        const result = await crawl({
          previousState: {
            files: new Map([['removed.js', ['', 123, 234, 0, '', null, 0]]]),
            clocks: new Map(),
          },
          includeSymlinks,
          extensions: ['js'],
          ignore: path => path.includes('ignored'),
          roots: [FIXTURES_DIR],
          rootDir: FIXTURES_DIR,
          abortSignal: null,
          computeSha1: false,
          forceNodeFilesystemAPI: false,
          onStatus: () => {},
        });

        // Map comparison is unordered, which is what we want
        expect(result).toMatchObject({
          changedFiles: expectedChangedFiles,
          removedFiles: new Map([
            ['removed.js', ['', 123, 234, 0, '', null, 0]],
          ]),
        });
        if (crawlerName === 'watchman') {
          expect(result.clocks).toBeInstanceOf(Map);
        }
      },
    );
  },
);
