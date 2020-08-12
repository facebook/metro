---
id: troubleshooting
title: Troubleshooting
---

Uh oh, something went wrong? Use this guide to resolve issues with Metro.

 1. Clear watchman watches: `watchman watch-del-all`
 2. Delete `node_modules` and run `yarn install`
 3. Reset Metro's cache by passing the `--reset-cache` flag, or adding `resetCache: true` to your metro configuration file.
 4. Remove the cache: `rm -rf /tmp/metro-*`
 5. Update Metro to the [latest version](https://www.npmjs.com/package/metro)

### Still unresolved?

See the [Help](/metro/help) pages.
