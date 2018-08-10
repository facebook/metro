---
id: configuration
title: Configuring Metro
---

A Metro config can be created in these three ways (ordered by priority):

1.  `metro.config.js`
2.  `metro.config.json`
3.  The `metro` field in `package.json`

You can also give a custom file to the configuration by specifying `--config <path/to/config>` when calling the CLI.

## Configuration Structure

The configuration is based on [our concepts](./Concepts.md), which means that for every module we have a separate config option. A common configuration structure in Metro looks like this:

```js
module.exports = {
  resolver: {
    /* resolver options */
  },
  transformer: {
    /* transformer options */
  },
  serializer: {
    /* serializer options */
  },
  server: {
    /* server options */
  }

  /* general options */
};
```

### General Options

| Option                  | Type                                  | Description                                                                                       |
| ----------------------- | ------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `cacheStores`           | `Array<CacheStore<TransformResult<>>` | List where we store our [caches](./Caching.md).                                                   |
| `createModuleIdFactory` | `() => (path: string) => number`      | Used to generate the module id for `require` statements.                                          |
| `cacheVersion`          | `string`                              | Can be used to generate a key that will invalidate the whole metro cache.                         |
| `projectRoot`           | `string`                              | The root folder of your project.                                                                  |
| `watchFolders`          | `Array<string>`                       | Specify any additional (to projectRoot) watch folders, this is used to know which files to watch. |
| `transformModulePath`   | `string`                              | The path to the transformer module to use.                                                        |
| `watch`                 | `boolean`                             | Whether we should watch for all files.                                                            |
| `reporter`              | `{update: () => void}`                | Used to report the status of the bundler during the bundling process.                             |
| `resetCache`            | `boolean`                             | Whether we should reset the cache when starting the build.                                        |
| `maxWorkers`            | `number`                              | The number of workers we should parallelize the transformer on.                                   |

### Server Options

These options are used when Metro serves the content.

| Option              | Type                                 | Description                                                            |
| ------------------- | ------------------------------------ | ---------------------------------------------------------------------- |
| `port`              | `number`                             | Which port to listen on.                                               |
| `useGlobalHotkey`   | `boolean`                            | Whether we should enable CMD+R hotkey for refreshing the bundle.       |
| `enhanceMiddleware` | `(Middleware, Server) => Middleware` | The possibility to add custom middleware to the server response chain. |

### Transformer Options

| Option                   | Type                                    | Description                                                       |
| ------------------------ | --------------------------------------- | ----------------------------------------------------------------- |
| `asyncRequireModulePath` | `string`                                | What module to use for handling async requires.                   |
| `dynamicDepsInPackages`  | `string` (`throwAtRuntime` or `reject`) | What should happen when a dynamic dependency is found.            |
| `enableBabelRCLookup`    | `boolean`                               | Whether we should use the `.babelrc` config file.                 |
| `getTransformOptions`    | `GetTransformOptions`                   | Get the transform options.                                        |
| `postMinifyProcess`      | `PostMinifyProcess`                     | What happens after minification..                                 |
| `minifierPath`           | `string`                                | Path to the minifier that minifies the code after transformation. |

#### React Native Only

| Option              | Type     | Description                     |
| ------------------- | -------- | ------------------------------- |
| `assetRegistryPath` | `string` | Where to fetch the assets from. |

### Resolver Options

| Option               | Type                     | Description                                                                                                                                                                                                                                                        |
| -------------------- | ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `assetExts`          | `Array<string>`          | An array of asset extensions to include in the bundle. For example, if you would give `['ttf']` you would be able to include `.ttf` files in the bundle.                                                                                                           |
| `sourceExts`         | `Array<string>`          | An array of source extensions to include in the bundle. For example, if you would give `['ts']` you would be able to include `.ts` files in the bundle.                                                                                                            |
| `resolverMainFields` | `Array<string>`          | Specify the fields in package.json files that will be used by the module resolver to do redirections when requiring certain packages. For example, using `['browser', 'main']` will use the `browser` field if it exists and will default to `main` if it doesn't. |
| `extraNodeModules`   | `{[name:string]:string}` | Which other `node_modules` to include besides the ones relative to the project directory. This is keyed by dependency name.                                                                                                                                        |
| `resolveRequest`     | `?CustomResolver`        | An optional function used to resolve requests. Ignored when the request can be resolved through Haste.                                                                                                                                                             |
| `useWatchman`        | `boolean`                | If set to `false`, it'll prevent Metro from using watchman (even if it's installed).                                                                                                                                                                               |

These options are only useful with React Native projects.

| Option                      | Type            | Description                                                                                                                                                        |
| --------------------------- | --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `blacklistRE`               | `RegExp`        | A RegEx defining which paths to ignore.                                                                                                                            |
| `hasteImplModulePath`       | `string`        | The path to the haste resolver.                                                                                                                                    |  |
| `platforms`                 | `Array<string>` | Additional platforms to look out for, For example, if you want to add a "custom" platform, and use modules ending in .custom.js, you would return ['custom'] here. |
| `providesModuleNodeModules` | `Array<string>` | Specify any additional node modules that should be processed for providesModule declarations.                                                                      |

### Serializer Options

| Option                          | Type                                                                   | Description                                                                                                                                 |
| ------------------------------- | ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `getRunModuleStatement`         | `(number` &#x7c; `string) => string`                                   | Specify the format of the initial require statements that are appended at the end of the bundle. By default is `__r(${moduleId});`.     |
| `getPolyfills`                  | `({platform: ?string}) => $ReadOnlyArray<string>`                      | An optional list of polyfills to include in the bundle. The list defaults to a set of common polyfills for Number, String, Array, Object... |
| `postProcessBundleSourcemap`    | `PostProcessBundleSourcemap`                                           | An optional function that can modify the code and source map of the bundle before it is written. Applied once for the entire bundle.        |
| `getModulesRunBeforeMainModule` | `(entryFilePath: string) => Array<string>`                             | An array of modules to be required before the entry point. It should contain the absolute path of each module.                              |
| `processModuleFilter`            | `(module: Array<Module>) => boolean` | A filter function to discard specific modules from the output.                                                                                  |
