/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @format
 * @oncall react_native
 */

import nodeCrawl from '../node';
import watchmanCrawl from '../watchman';
import {execSync} from 'child_process';
import os from 'os';
import {join} from 'path';
import type {CrawlerOptions, FileData} from '../../flow-types';

// At runtime we use a more sophisticated + robust Watchman capability check,
// but this simple heuristic is fast to check, synchronous (we can't
// asynchronously skip tests: https://github.com/facebook/jest/issues/8604),
// and will tend to exercise our Watchman tests whenever possible.
const isWatchmanOnPath = () => {
  try {
    execSync(
      os.platform() === 'win32' ? 'where.exe watchman' : 'which watchman',
    );
    return true;
  } catch {
    return false;
  }
};

const mockUseNativeFind = jest.fn();
jest.mock('../node/hasNativeFindSupport', () => () => mockUseNativeFind());

type Crawler = (opts: CrawlerOptions) => Promise<{
  removedFiles: FileData,
  changedFiles: FileData,
}>;

const CRAWLERS: {[key: string]: ?Crawler} = {
  'node-find':
    os.platform() !== 'win32'
      ? opts => {
          mockUseNativeFind.mockResolvedValue(true);
          return nodeCrawl(opts);
        }
      : null,
  'node-recursive': opts => {
    mockUseNativeFind.mockResolvedValue(false);
    return nodeCrawl(opts);
  },
  watchman: isWatchmanOnPath() ? watchmanCrawl : null,
};

const FIXTURES_DIR = join(__dirname, '..', '__fixtures__');

describe.each(Object.keys(CRAWLERS))(
  'Crawler integration tests (%s)',
  crawlerName => {
    const crawl = CRAWLERS[crawlerName];
    const maybeTest = crawl ? test : test.skip;

    maybeTest('Finds the expected files', async () => {
      const result = await crawl({
        previousState: {
          files: new Map([['removed.js', ['', 123, 234, 0, '', null]]]),
          clocks: new Map(),
        },
        enableSymlinks: false,
        extensions: ['js'],
        ignore: path => path.includes('ignored'),
        roots: [FIXTURES_DIR],
        rootDir: FIXTURES_DIR,
      });

      // Map comparison is unordered, which is what we want
      expect(result).toMatchObject({
        changedFiles: new Map([
          [
            join('directory', 'bar.js'),
            ['', expect.any(Number), 245, 0, '', null],
          ],
          ['foo.js', ['', expect.any(Number), 245, 0, '', null]],
        ]),
        removedFiles: new Map([['removed.js', ['', 123, 234, 0, '', null]]]),
      });
      if (crawlerName === 'watchman') {
        expect(result.clocks).toBeInstanceOf(Map);
      }
    });
  },
);
