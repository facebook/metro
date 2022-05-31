---
id: caching
title: Caching
---

Metro has a multi-layered cache: you can set up multiple caches to be used by Metro instead of one. This has several advantages, on this page we will explain how the caches work.

## Why Cache?

Caches give big performance benefits, they can increase the speed of a bundler with more than tenfold. However, many systems use a non-persistent cache. With Metro we have a more sophisticated way of caching with a layer system. For example, we can store the cache on a server. Because of this all bundlers connected to the same server can use the shared cache. As a result the initial build time for CI servers and local development become significantly lower.

We want to store caches in multiple places as to always have a cache to fallback to. That's why there is a multi-layered cache system.

## Cache Fetching & Saving

There is an ordering mechanism to determine which cache to use. For retrieving a cache we go through the caches from _top to bottom_ until we find a result, for saving a cache we do the same until we find a store that has the cache.

Let's say you have two cache stores: one on a server and one on your local file system. You would specify that in this way:

```js
const config = {
  cacheStores: [
    new FileStore({/*opts*/}),
    new HttpStore({/*opts*/})
  ]
}
```

Metro will first look into the `FileStore` when we retrieve a cache. If it can't find the cache there it will check `HttpStore`, and so on. Finally if there's no cache there it will generate a new cache itself. As soon as the cache has been generated, Metro will go again from top to bottom to store the cache in _all_ stores. This also happens if a cache is found. For example, if Metro finds a cache in the `HttpStore` it will store it in `FileStore` as well.
