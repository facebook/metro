---
id: configuration
title: Configuring Metro
---

A Metro config can be created in these three ways (ordered by priority):

1.  `metro.config.js`
2.  `metro.config.json`
3.  The `metro` field in `package.json`

You can also give a custom file to the configuration by specifying `--config <path/to/config>` when calling the CLI.

:::note

When Metro is started via the React Native CLI, some defaults are different from those mentioned below.
See the [React Native repository](https://github.com/react-native-community/cli/blob/master/packages/cli-plugin-metro/src/tools/loadMetroConfig.ts) for details.

:::

## Configuration Structure

The configuration is based on [our concepts](./Concepts.md), which means that for every module we have a separate config option. A common configuration structure in Metro looks like this:

```js
module.exports = {
  /* general options */

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
};
```

### General Options


#### `cacheStores`

Type: `Array<CacheStore<TransformResult<>>>`

List where we store our [caches](./Caching.md).

#### `cacheVersion`

Type: `string`

Can be used to generate a key that will invalidate the whole metro cache.

#### `projectRoot`

Type: `string`

The root folder of your project.

#### `watchFolders`

Type: `Array<string>`

Specify any additional (to projectRoot) watch folders, this is used to know which files to watch.
(By default the file watching is disabled in CI environments. Also it can be manually disabled by setting the env variable `CI=true`)

#### `transformerPath`

Type: `string`

The absolute path of a module (or a package name resolvable from the `metro` package) exporting a `transform` function.

#### `reporter`

Type: `{update: () => void}`

Used to report the status of the bundler during the bundling process.

#### `resetCache`

Type: `boolean`

Whether we should reset the cache when starting the build.

#### `stickyWorkers`

Type: `boolean`

Control whether the created workers should stick based on filename or not.

#### `maxWorkers`

Type: `number`

The number of workers we should parallelize the transformer on.

#### `hasteMapCacheDirectory`

Type: `string`

The path to the haste map cache directory, defaults to `os.tmpdir()`.

---
### Resolver Options

#### `assetExts`

Type: `Array<string>`

An array of asset extensions to include in the bundle. For example, if you would give `['ttf']` you would be able to include `.ttf` files in the bundle.

#### `sourceExts`

Type: `Array<string>`

An array of source extensions to include in the bundle. For example, if you would give `['ts']` you would be able to include `.ts` files in the bundle.

#### `resolverMainFields`

Type: `Array<string>`

Specify the fields in package.json files that will be used by the module resolver to do redirections when requiring certain packages. The default is `['browser', 'main']`, so the resolver will use the `browser` field if it exists and `main` otherwise.

:::note

When Metro is started via the React Native CLI this will default to `['react-native', 'browser', 'main']`.

:::

#### `disableHierarchicalLookup`

Type: `boolean`

Whether to disable [looking up modules in `node_modules` folders](https://nodejs.org/api/modules.html#modules_loading_from_node_modules_folders). This only affects the default search through the directory tree, not other Metro options like `extraNodeModules` or `nodeModulesPaths`. Defaults to `false`.

#### `emptyModulePath`

Type: `string`

What module to use as the canonical "empty" module when one is needed. Defaults to using the one included in `metro-runtime`. You only need to change this if Metro is installed outside of your project.

#### `extraNodeModules`

Type: `{[name:string]:string}`

Which other `node_modules` to include besides the ones relative to the project directory. This is keyed by dependency name.

#### `nodeModulesPaths`

Type: `Array<string>`

This option can be used to add additional `node_modules` folders for Metro to locate third-party dependencies when resolving modules. This is useful if third-party dependencies are installed in a different location outside of the direct path of source files.

This option works similarly to how [$NODE_PATH](https://nodejs.org/api/modules.html#modules_loading_from_the_global_folders) works for Node.js based tooling, except that `nodeModulesPaths` takes precedence over hierarchical `node_modules` lookup.

#### `resolveRequest`

Type: `?CustomResolver`

An optional function used to resolve requests. Particularly useful for cases where aliases or custom protocols are used. For example:

```javascript
resolveRequest: (context, moduleName, platform) => {
  if (moduleName.startsWith('my-custom-resolver:')) {
    // Resolve file path logic...
    // NOTE: Throw an error if there is no resolution.
    return {
      filePath: "path/to/file",
      type: 'sourceFile',
    };
  }
  // Optionally, chain to the standard Metro resolver.
  return context.resolveRequest(context, moduleName, platform);
}
```

#### `useWatchman`

Type: `boolean`

If set to `false`, it'll prevent Metro from using watchman (even if it's installed)

These options are only useful with React Native projects.

#### `blockList`

Type: `RegExp` or `Array<RegExp>`

A RegEx defining which paths to ignore, however if a blocklisted file is required it will be brought into the dependency graph.

#### `hasteImplModulePath`

Type: `string`

The path to the haste resolver.

#### `platforms`

Type: `Array<string>`

Additional platforms to look out for, For example, if you want to add a "custom" platform, and use modules ending in .custom.js, you would return ['custom'] here.

---
### Transformer Options

#### `asyncRequireModulePath`

Type: `string`

What module to use for handling async requires.

#### `babelTransformerPath`

Type: `string`

Use a custom babel transformer (only relevant when using the default transformerPath). For example:

```javascript
// in your babelTransformer file
module.exports = ({ filename, options, plugins, src }) => {
  // transform file...
  return { ast: AST };
}
```

#### `dynamicDepsInPackages`

Type: `string` (`throwAtRuntime` or `reject`)

What should happen when a dynamic dependency is found.

#### `enableBabelRCLookup`

Type: `boolean` (default: `true`)

Whether we should use the `.babelrc` config file.

#### `enableBabelRuntime`

Type: `boolean | string` (default: `true`)

Whether the transformer should use the `@babel/transform/runtime` plugin.

If the value is a string, it is treated as a runtime version number and passed as `version` to the `@babel/plugin-transform-runtime` configuration. This allows you to optimize the generated babel runtime based on the
runtime in the app's node modules confugration.

#### `getTransformOptions`

Type: `GetTransformOptions`

Get the transform options.

#### `hermesParser`

Type: `boolean` (default: `false`)

Use the hermes-parser package to use call Hermes parser via WASM instead of the Babel parser.

#### `minifierPath`

Type: `string`

Path to the minifier that minifies the code after transformation.

#### `minifierConfig`

Type: `{[key: string]: mixed}`

Configuration object that will be passed to the minifier (it should be serializable).

#### `optimizationSizeLimit`

Type: `number`

Define a threshold (in bytes) to disable some expensive optimizations for big files.

#### React Native Only

#### `assetPlugins`

Type: `Array<string>`

List of modules to call to modify Asset data

#### `assetRegistryPath`

Type: `string`

Where to fetch the assets from.

---
### Serializer Options

#### `getRunModuleStatement`

Type: `(number` &#x7c; `string) => string`

Specify the format of the initial require statements that are appended at the end of the bundle. By default is `__r(${moduleId});`.

#### `createModuleIdFactory`

Type: `() => (path: string) => number`

Used to generate the module id for `require` statements.

#### `getPolyfills`

Type: `({platform: ?string}) => $ReadOnlyArray<string>`

An optional list of polyfills to include in the bundle. The list defaults to a set of common polyfills for Number, String, Array, Object...

#### `postProcessBundleSourcemap`

Type: `PostProcessBundleSourcemap`

An optional function that can modify the code and source map of the bundle before it is written. Applied once for the entire bundle.

#### `getModulesRunBeforeMainModule`

Type: `(entryFilePath: string) => Array<string>`

An array of modules to be required before the entry point. It should contain the absolute path of each module. Note that this will add the additional require statements only if the passed modules are already included as part of the bundle.

#### `processModuleFilter`

Type: `(module: Array<Module>) => boolean`

A filter function to discard specific modules from the output.

---
### Server Options

These options are used when Metro serves the content.

#### `port`

Type: `number`

Which port to listen on.

#### `useGlobalHotkey`

Type: `boolean`

Whether we should enable CMD+R hotkey for refreshing the bundle.

#### `enhanceMiddleware`

Type: `(Middleware, Server) => Middleware`

The possibility to add custom middleware to the server response chain.

#### `rewriteRequestUrl`

Type: `string => string`

A function that will be called every time Metro processes a URL. Metro will use the return value of this function as if it were the original URL provided by the client. This applies to all incoming HTTP requests (after any custom middleware), as well as bundle URLs in `/symbolicate` request payloads and within the hot reloading protocol.

#### `runInspectorProxy`

Type: `boolean` (default: `true`)

Run Inspector Proxy server inside Metro to be able to inspect React Native code.


## Merging Configurations

Using the `metro-config` package it is possible to merge multiple configurations together.

| Method                                  | Description                                                            |
| --------------------------------------- | ---------------------------------------------------------------------- |
| `mergeConfig(...configs): MergedConfig` | Returns the merged configuration of two or more configuration objects. |

:::note

Arrays and function based config parameters do not deeply merge and will instead override any pre-existing config parameters.
This allows overriding and removing default config parameters such as `platforms` or `getModulesRunBeforeMainModule` that may not be required in your environment.

:::

#### Merging Example

```js
// metro.config.js
const { mergeConfig } = require("metro-config");

const configA = {
  /* general options */

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
};

const configB = {
  /* general options */

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
};

module.exports = mergeConfig(configA, configB);
```
