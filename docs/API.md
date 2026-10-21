---
id: api
title: Bundling API
---

## Quick Start

- Compile a file

  ```js
  const config = await Metro.loadConfig();

  await Metro.runBuild(config, {
    entry: 'index.js',
    out: 'bundle.js',
  });
  ```

- Run a server and watch the filesystem for changes

  ```js
  const config = await Metro.loadConfig();

  await Metro.runServer(config);
  ```

- Create a Connect middleware and plug it into a server

  ```js
  const Metro = require('metro');
  const express = require('express');
  const app = express();
  const server = require('http').Server(app);

  Metro.loadConfig().then(async config => {
    const connectMiddleware = await Metro.createConnectMiddleware(config);
    const {server: {port}} = config;

    app.use(connectMiddleware.middleware);
    server.listen(port);
    connectMiddleware.attachHmrServer(server);
  });
  ```

## Reference

The `config` object accepted by the functions below is the [Metro configuration](./Configuration.md) exported by your `metro.config.js` file, which you can obtain with `Metro.loadConfig`.

### `loadConfig(<options>, <defaultConfigOverrides>)`

**Basic options:** `config`, `cwd`

Load the Metro configuration, either from the path given in `config` if specified, or by traversing the directory hierarchy from `cwd` up to the user's home directory until it finds a [config file](./Configuration.md). The returned configuration will have been normalized and merged with Metro's default values, after applying `defaultConfigOverrides` to the defaults.

`loadConfig` also accepts the options of the [CLI](./CLI.md), which override the corresponding config values: `port` ([`server.port`](./Configuration.md#port)), `projectRoot`, `watchFolders`, `assetExts`, `sourceExts` and `platforms` (the `resolver` options of the same names), [`maxWorkers`](./Configuration.md#maxworkers) (which defaults to a number based on `os.availableParallelism()`), `transformer` ([`transformer.babelTransformerPath`](./Configuration.md#babeltransformerpath)), `resetCache`, and `verbose` (`false` silences Metro's terminal output).

### `async runMetro(config, <options>)`

**Basic options:** `waitForBundler`, `watch`, `onBundleBuilt`, `hasReducedPerformance`

Creates a Metro server based on the config and returns it. Its `processRequest` method can be used as a middleware in your existing server. `hasReducedPerformance` only makes Metro's terminal output warn that Metro is operating with reduced performance.

### `async runBuild(config, <options>)`

**Required options:** `entry`

**Basic options:** `out`, `bundleOut`, `sourceMapOut`, `dev`, `minify`, `platform`, `sourceMap`, `sourceMapUrl`, `assets`, `onBegin`, `onProgress`, `onComplete`, `customResolverOptions`, `customTransformOptions`, `unstable_transformProfile`, `output`

Bundles `entry` for the given `platform` (defaults to `'web'`). If `out` or `bundleOut` is given, saves the bundle to `bundleOut`, or to `out` with a `.js` extension. If `sourceMap` is set, also generates a source map. The source map will be inlined, unless `sourceMapUrl` is also defined, in which case `sourceMapUrl` is used as the bundle's `sourceMappingURL`. When saving to disk, the source map is also written to `sourceMapOut`, or to `out` with a `.map` extension. If `assets` is `true`, an array of `AssetData` will be generated and returned in the `assets` property of the result object.

`output` replaces how the bundle is built and written to disk. It is an object with two functions: `build(server, requestOptions, buildOptions)`, whose result `runBuild` resolves to and passes to `save`, and `save(bundle, outputOptions, log)`, which is only called if `out` or `bundleOut` is given. Defaults to Metro's plain bundle output, `metro/private/shared/output/bundle`. For example, `require('metro/private/shared/output/RamBundle')` writes a [RAM bundle](./Bundling.md#indexed-ram-bundle) instead.

### `async runServer(config, <options>)`

**Basic options:** `host`, `onReady`, `onClose`, `onError`, `waitForBundler`, `watch`, `hasReducedPerformance`, `websocketEndpoints`, `secureServerOptions`, `unstable_middleware`, `unstable_priorityMiddleware`, `unstable_onServerCreated`, `secure (DEPRECATED)`, `secureKey (DEPRECATED)`, `secureCert (DEPRECATED)`

Starts a full Metro HTTP server. It will listen on the specified `host` and [`server.port`](./Configuration.md#port), and can then be queried to retrieve bundles for various entry points. If `secureServerOptions` or [`server.tls`](./Configuration.md#tls) is present, the server will be exposed over HTTPS. Resolves to `{httpServer}`.

`unstable_middleware` and `unstable_priorityMiddleware` take the same shapes as [`server.unstable_middleware`](./Configuration.md#unstable_middleware-experimental) and [`server.unstable_priorityMiddleware`](./Configuration.md#unstable_prioritymiddleware-experimental), and wrap them: `unstable_middleware` passed here runs after the config's, and `unstable_priorityMiddleware` runs before the config's.

Priority middleware handlers must call `next()` for every request they don't fully handle, so that Metro can serve bundles, source maps, assets and its other endpoints.

`unstable_onServerCreated` is called with Metro's server instance before the HTTP server starts listening, after [`server.unstable_onServerCreated`](./Configuration.md#unstable_onservercreated-experimental).

`secure`, `secureKey`, `secureCert` are now deprecated and will be removed in a later release. The presence of `secureServerOptions`, along with its options will make Metro run over https.

### `createConnectMiddleware(config, <options>)`

**Basic options:** `onBundleBuilt`, `watch`, `waitForBundler`, `hasReducedPerformance`

Instead of creating the full server, creates a Connect middleware that answers to bundle requests. This middleware can then be plugged into your own servers. Resolves to `{middleware, attachHmrServer(httpServer), metroServer, end()}`. The `onBundleBuilt` function is optional, is passed the bundle path, and is called when the server has finished creating the bundle.

### `async buildGraph(config, <options>)`

**Required options:** `entries`

**Basic options:** `dev`, `minify`, `platform`, `type`, `customTransformOptions`

Resolves and transforms the dependency graph for the given `entries` without serializing a bundle, and returns the graph.

### `attachMetroCli(yargs, <options>)`

**Basic options:** `build`, `serve`, `dependencies`

Registers Metro's [CLI commands](./CLI.md) on a `yargs` instance. Pass `null` for a command to omit it.
