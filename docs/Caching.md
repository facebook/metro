---
id: caching
title: Caching
---

Out of the box, Metro speeds up builds using a **local cache** of [transformed](./Concepts.md#transformation) modules. Thanks to this cache, Metro doesn't need to retransform modules unless the source code (or current configuration) has changed since the last time they were transformed.

Metro also has the ability to use a **remote cache**. This can dramatically speed up builds for larger teams and/or larger codebases by reducing the amount of time spent locally building remote changes even further. For example, this is how we use Metro to build React Native apps at Meta (a codebase with many thousands of files and hundreds of daily active engineers).

A typical setup for a remote cache involves:

1. A storage backend specific to your team (e.g. S3 bucket).
2. Running [`metro build`](./CLI.md#build-entry) periodically (e.g. in a CI job) to populate the cache, using `HttpStore` (or a custom read/write cache store) in your Metro config.
3. Configuring Metro on your development machines to read from the cache, using `HttpGetStore` (or a custom read-only cache store) in your Metro config.

The main option for configuring the Metro cache is [`cacheStores`](./Configuration.md#cachestores). Typically, the local cache (e.g. `FileStore`) should be listed first, followed by the remote cache (e.g. `HttpCache`).

## Built-in cache stores

Metro provides a number of built-in cache store implementations for use with the [`cacheStores`](./Configuration.md#cachestores) config option:

* **`FileStore({root: string})`** will store cache entries as files under the directory specified by `root`.
* **`AutoCleanFileStore()`** is a `FileStore` that periodically cleans up old entries. It accepts the same options as `FileStore` plus the following:
  * **`options.intervalMs: number`** is the time in milliseconds between cleanup attempts. Defaults to 10 minutes.
  * **`options.cleanupThresholdMs: number`** is the minimum time in milliseconds since the last modification of an entry before it can be deleted. Defaults to 3 days.
* **`HttpStore(options)`** is a bare-bones remote cache client that reads (`GET`) and writes (`PUT`) compressed cache artifacts over HTTP or HTTPS.
  * **`options.endpoint: string`** is the base URL for the cache server. For example, an `HttpStore` with `'http://www.example.com/endpoint'` as the endpoint would issue requests to URLs such as `http://www.example.com/endpoint/c083bff944879d9f528cf185eba0f496bc10a47d`.
  * **`options.timeout: number`** is the timeout for requests to the cache server, in milliseconds. Defaults to 5000.
  * **`options.family: 4 | 6`** is the same as the `family` parameter to Node's [`http.request`](https://nodejs.org/api/http.html#httprequesturl-options-callback).
  * **`options.cert`, `options.ca`, `options.key`**: HTTPS options passed directly to [Node's built-in HTTPS client](https://nodejs.org/api/https.html).
* **`HttpGetStore(options)`** is a read-only version of `HttpStore`.

You can import these classes from the `metro-cache` package or get them through the function form of `cacheStores`:

```js
// metro.config.js
const os = require('node:os');
const path = require('node:path');

module.exports = {
  cacheStores: ({ FileStore }) => [
    new FileStore({
      root: path.join(os.tmpdir(), 'metro-cache'),
    }),
  ],
};

```

## Custom cache stores

To implement a custom cache store, pass an instance of a class with the following interface into [`cacheStores`](./Configuration.md#cachestores):

```flow
interface CacheStore<T: Buffer | JsonSerializable> {
  // Read an entry from the cache. Returns `null` if not found.
  get(key: Buffer): ?T | Promise<?T>;

  // Write an entry to the cache (if writable) or do nothing (if read-only)
  set(key: Buffer, value: T): void | Promise<void>;

  // Clear the cache (if possible) or do nothing
  clear(): void | Promise<void>;
}

type JsonSerializable = /* Any JSON-serializable value */;
```

The value of a cache entry is either an instance of [`Buffer`](https://nodejs.org/api/buffer.html#buffer) or a JSON-serializable value (with unspecified internal structure in both cases). For a given cache key, `get()` *must* return the same type of value that was originally provided to `set()`.
