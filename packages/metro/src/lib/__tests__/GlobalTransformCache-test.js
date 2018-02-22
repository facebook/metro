/**
 * Copyright (c) 2016-present, Facebook, Inc.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @format
 * @emails oncall+js_foundation
 */

'use strict';

jest.useRealTimers();

const mockFetch = jest.fn();
jest.mock('node-fetch', () => mockFetch);

const {URIBasedGlobalTransformCache} = require('../GlobalTransformCache');
const FetchError = require('node-fetch/lib/fetch-error');

const getTransformOptions = require('../../__fixtures__/getTransformOptions');

async function fetchResultURIs(
  keys: Array<string>,
): Promise<Map<string, string>> {
  return new Map(keys.map(key => [key, `http://globalcache.com/${key}`]));
}

async function fetchResultFromURI(uri: string): Promise<?CachedResult> {
  return {
    code: `/* code from ${uri} */`,
    dependencies: [],
    dependencyOffsets: [],
  };
}

describe('GlobalTransformCache', () => {
  it('fetches results', async () => {
    const cache = new URIBasedGlobalTransformCache({
      fetchResultFromURI,
      fetchResultURIs,
      profiles: [{dev: true, minify: false, platform: 'ios'}],
      rootPath: '/root',
      storeResults: null,
    });
    const transformOptions = await getTransformOptions();

    const result = await Promise.all([
      cache.fetch(
        cache.keyOf({
          localPath: 'some/where/foo.js',
          sourceCode: '/* beep */',
          getTransformCacheKey: () => 'abcd',
          transformOptions,
        }),
      ),
      cache.fetch(
        cache.keyOf({
          localPath: 'some/where/else/bar.js',
          sourceCode: '/* boop */',
          getTransformCacheKey: () => 'abcd',
          transformOptions,
        }),
      ),
    ]);
    expect(result).toMatchSnapshot();
  });

  describe('fetchResultFromURI', () => {
    const defaultFetchMockImpl = async uri => ({
      status: 200,
      json: async () => ({
        code: `/* code from ${uri} */`,
        dependencies: [],
        dependencyOffsets: [],
      }),
    });

    beforeEach(() => {
      mockFetch.mockReset();
    });

    it('fetches result', async () => {
      mockFetch.mockImplementation(defaultFetchMockImpl);
      const result = await URIBasedGlobalTransformCache.fetchResultFromURI(
        'http://globalcache.com/foo',
      );
      expect(result).toMatchSnapshot();
    });

    it('retries once on timeout', async () => {
      mockFetch.mockImplementation(async uri => {
        mockFetch.mockImplementation(defaultFetchMockImpl);
        throw new FetchError('timeout!', 'request-timeout');
      });
      const result = await URIBasedGlobalTransformCache.fetchResultFromURI(
        'http://globalcache.com/foo',
      );
      expect(result).toMatchSnapshot();
    });
  });
});
