---
id: cli
title: Metro CLI Options
---

The `metro` command line runner has a number of useful options. You can run `metro
--help` to view all available options. Here is a brief overview:

## `build <entry>`

Generates a JavaScript bundle containing the specified entrypoint and its descendants.

### Options

| Option   | Description    |
|----------|----------|
| `out`    | Location of the output      |


## `serve`

Starts a Metro server on the given port, building bundles on the fly.

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
