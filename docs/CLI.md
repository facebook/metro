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
| `out`    | `O` | File name where to store the output | String |
| `platform` | `p` | Which platform to bundle for | `web`, `android`, `ios` |
| `minify` | `z` | Whether Metro should minify the bundle | Boolean |
| `dev` | `g` | Create a development version of the build (`process.env.NODE_ENV = 'development'`) | Boolean |
| `config` | `c` | Location of the `metro.config.js` to use | String |
| `max-workers` | `j` | The number of workers Metro should parallelize the transformer on | Number |
| `project-roots` | `P` | The root folder of your project | Array |
| `source-map` |  | Whether Metro should generate source maps | Boolean |
| `source-map-url` |  | URL where the source map can be found | String |
| `legacy-bundler` |  | Whether Metro should use the legacy bundler | Boolean |


## `serve`

Starts Metro on the given port, building bundles on the fly.

## `get-dependencies`

Lists dependencies.

### Options

| Option | Description |
|---|---|
| `entry-file` | Absolute path to the root JS file |
| `output` | File name where to store the output, ex. /tmp/dependencies.txt |
| `platform` | The platform extension used for selecting modules |
| `transformer` | Specify a custom transformer to be used |
| `max-workers` | Specifies the maximum number of workers the worker-pool will spawn for transforming files. This defaults to the number of the cores available on your machine. |
| `dev` | If false, skip all dev-only code path |
| `verbose` | Enables logging |
