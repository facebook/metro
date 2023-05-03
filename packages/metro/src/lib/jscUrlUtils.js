/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @format
 * @flow strict
 */

/**
 * These functions are for handling of query-string free URLs, necessitated
 * by query string stripping of URLs in JavaScriptCore stack traces
 * introduced in iOS 16.4.
 *
 * See https://github.com/facebook/react-native/issues/36794 for context.
 */

const PLACEHOLDER_HOST = 'placeholder://example.com';
const JSC_QUERY_STRING_DELIMETER = ';&';

function normalizeJscUrl(urlToNormalize: string): string {
  try {
    const urlObj = new URL(urlToNormalize, PLACEHOLDER_HOST);
    const delimeterIdx = urlObj.pathname.indexOf(JSC_QUERY_STRING_DELIMETER);
    if (delimeterIdx === -1) {
      return urlToNormalize;
    }

    // HTTP request lines may be either absolute *paths* (HTTP GET /foo) or
    // absolute URIs (HTTP GET http://domain.com/foo) - so we should handle
    // both.
    // ( https://datatracker.ietf.org/doc/html/rfc9112#name-request-target )
    const isAbsoluteURI = !urlObj.href.startsWith(PLACEHOLDER_HOST);

    // Relative paths are not valid in an HTTP GET request line, but account
    // for them for completeness. We'll use this to conditionally remove the
    // `/` added by `URL`.
    const isAbsolutePath = urlToNormalize.startsWith('/');

    // This is our regular pathname
    const pathBeforeDelimeter = urlObj.pathname.substring(0, delimeterIdx);
    // This will become our query string
    const pathAfterDelimeter = urlObj.pathname.slice(
      delimeterIdx + JSC_QUERY_STRING_DELIMETER.length,
    );

    urlObj.pathname = pathBeforeDelimeter;
    if (urlObj.search) {
      // JSC-style URLs wouldn't normally be expected to have regular query
      // strings, but append them if present
      urlObj.search = `?${pathAfterDelimeter}&${urlObj.search.slice(1)}`;
    } else {
      urlObj.search = `?${pathAfterDelimeter}`;
    }
    let urlToReturn = urlObj.href;
    if (!isAbsoluteURI) {
      urlToReturn = urlToReturn.replace(PLACEHOLDER_HOST, '');
      if (!isAbsolutePath) {
        urlToReturn = urlToReturn.slice(1);
      }
    }
    return urlToReturn;
  } catch (e) {
    // Preserve malformed URLs
    return urlToNormalize;
  }
}

function toJscUrl(urlToConvert: string): string {
  try {
    const urlObj = new URL(urlToConvert, PLACEHOLDER_HOST);
    if (urlObj.search == null || !urlObj.search.startsWith('?')) {
      return urlToConvert;
    }
    const isAbsoluteURI = !urlObj.href.startsWith(PLACEHOLDER_HOST);
    // Relative paths are not valid in an HTTP GET request line, but may appear otherwise
    const isAbsolutePath = urlToConvert.startsWith('/');

    const queryString = urlObj.search.slice(1);
    // NB: queryString may legally contain unencoded '?' in key or value names.
    // Writing them into the path will implicitly encode them.
    urlObj.pathname =
      urlObj.pathname + JSC_QUERY_STRING_DELIMETER + queryString;
    urlObj.search = '';
    let urlToReturn = urlObj.href;
    if (!isAbsoluteURI) {
      urlToReturn = urlToReturn.replace(PLACEHOLDER_HOST, '');
      if (!isAbsolutePath) {
        urlToReturn = urlToReturn.slice(1);
      }
    }
    return urlToReturn;
  } catch (e) {
    // Preserve malformed URLs
    return urlToConvert;
  }
}

module.exports = {
  normalizeJscUrl,
  toJscUrl,
};
