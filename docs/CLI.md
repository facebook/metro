---
id: cli
title: Metro CLI Options
---

The `metro` command line runner has a number of useful options. You can run `metro
--help` to view all available options. Here is a brief overview:

## `build <entry>`

Generates a JavaScript bundle containing the specified entrypoint and its descendants.

### Options

| Option   | Alias    | Description    | Value |
|----------|----------|----------|----------|
| `out`    | `O` | File name where to store the output (required) | String |
| `platform` | `p` | Which platform to bundle for (e.g. `web`, `android`, `ios`) | String |
| `minify` | `z` | Whether Metro should minify the bundle | Boolean |
| `dev` | `g` | Create a development build, in which `__DEV__` is `true` | Boolean |
| `config` | `c` | Location of the `metro.config.js` to use | String |
| `max-workers` | `j` | The number of workers Metro should parallelize the transformer on. Overrides [`maxWorkers`](./Configuration.md#maxworkers) which defaults to a number based on `os.availableParallelism()` | Number |
| `project-roots` | `P` | Accepted, but has no effect | Array |
| `source-map` |  | Whether Metro should generate source maps | Boolean |
| `source-map-url` |  | URL where the source map can be found | String |
| `legacy-bundler` |  | Accepted, but has no effect | Boolean |
| `resolver-option` |  | [Custom resolver options](./Resolution.md#customresolveroptions-string-mixed) of the form `key=value` | Array |
| `transform-option` | `transformer-option` | Custom transform options of the form `key=value` | Array |
| `reset-cache` |  | **Deprecated.** Clears Metro's caches before building, like [`resetCache`](./Configuration.md#resetcache) | Boolean |
| `output-type` | `t` | Accepted, but has no effect | String |


## `serve`

Alias: `start`

Starts Metro on the given port, building bundles on the fly. Restarts the server when the config file changes.

### Options

| Option   | Alias    | Description    | Value |
|----------|----------|----------|----------|
| `host` | `h` | Host to listen on. Defaults to `localhost` | String |
| `port` | `p` | Port to listen on. Defaults to `8081`, overriding [`server.port`](./Configuration.md#port) | Number |
| `config` | `c` | Location of the `metro.config.js` to use | String |
| `max-workers` | `j` | The number of workers Metro should parallelize the transformer on. Overrides [`maxWorkers`](./Configuration.md#maxworkers) which defaults to a number based on `os.availableParallelism()` | Number |
| `secure-server-options` | `s` | Options for the HTTPS server, using dot notation (e.g. `-s.cert="$(cat path/to/cert)" -s.key="$(cat path/to/key)"`) | Object |
| `secure` |  | **Deprecated.** Serve over HTTPS. Use `secure-server-options` instead | Boolean |
| `secure-key` |  | **Deprecated.** Path to the key file for HTTPS when `secure` is set | String |
| `secure-cert` |  | **Deprecated.** Path to the cert file for HTTPS when `secure` is set | String |
| `reset-cache` |  | **Deprecated.** Clears Metro's caches on startup, like [`resetCache`](./Configuration.md#resetcache) | Boolean |
| `project-roots` | `P` | Accepted, but has no effect | Array |
| `hmr-enabled` | `hmr` | Accepted, but has no effect | Boolean |

## `get-dependencies [entryFile]`

List all dependencies that will be bundled for a given entry point.

### Options

| Option | Description |
|---|---|
| `entry-file` | Absolute path to the root JS file. This can also be given as the first positional arg. |
| `output` | File name where to store the output, ex. /tmp/dependencies.txt |
| `platform` | The platform extension used for selecting modules |
| `transformer` | Specify a custom transformer to be used |
| `max-workers` | Specifies the maximum number of workers the worker-pool will spawn for transforming files. Overrides [`maxWorkers`](./Configuration.md#maxworkers) which defaults to a number based on `os.availableParallelism()`. |
| `dev` | If false, skip all dev-only code path. Defaults to `true` |
| `verbose` | Enables logging. Defaults to `false` |
