---
id: resolution
title: Module Resolution
---

Module resolution is the process of translating module names to module paths at build time. For example, if your project contains the code:

```js
// src/App.js
import {View} from 'react-native';
// ...
```

Metro needs to know where in your project to load the `react-native` module from. This will typically resolve to something like `node_modules/react-native/index.js`.

Likewise, if your project contains the (similar) code:

```js
// src/App.js
import Comp from './Component';
// ...
```

Metro needs to understand that you are referring to, say, `src/Component.js`, and not another file named `Component` that may also exist elsewhere.

Metro implements a version of [Node's module resolution algorithm](https://nodejs.org/api/modules.html#loading-from-node_modules-folders), augmented with additional Metro-specific features.

These Metro-specific features include:
* **Haste**: An opt-in mechanism for importing modules by their globally-unique name anywhere in the project, e.g. `import Foo from 'Foo'`.
* **Platform extensions**: Used by [React Native](https://reactnative.dev/docs/platform-specific-code#platform-specific-extensions) to allow developers to write platform-specific versions of their JavaScript modules.
* **Asset extensions and image resolutions**: Used by [React Native](https://reactnative.dev/docs/images#static-image-resources) to automatically select the best version of an image asset based on the device's screen density at runtime.
* **Custom resolvers**: Metro integrators can provide their own resolver implementations to override almost everything about how modules are resolved.

## Resolution algorithm

Given a [resolution context](#resolution-context) _context_, a module name _moduleName_, and an optional platform identifier _platform_, Metro's resolver performs [**RESOLVE**](#resolve)(_context_, _moduleName_, _platform_), which either returns one of the [resolution types](#resolution-types), or throws an error.

### Resolution types

#### Source file

The request is resolved to some absolute path representing a physical file on disk.

#### Asset files

The request is resolved to one or more absolute paths representing physical files on disk.

#### Empty module

The request is resolved to a built-in empty module, namely the one specified in [`resolver.emptyModulePath`](./Configuration.md#emptymodulepath).

### Algorithm

:::note

These are the rules that Metro's default resolver follows. Refer to [`metro-resolver`'s source code](https://github.com/facebook/metro/blob/main/packages/metro-resolver/src/resolve.js) for more details.

:::

#### RESOLVE

Parameters: (*context*, *moduleName*, *platform*)

1. If a [custom resolver](#resolverequest-customresolver) is defined, then
    1. Return the result of the custom resolver.
2. Otherwise, attempt to resolve *moduleName* as a path
    1. Let *absoluteModuleName* be the result of prepending the current directory (i.e. parent of [`context.originModulePath`](#originmodulepath-string)) with *moduleName*.
    2. Return the result of [**RESOLVE_MODULE**](#resolve_module)(*context*, *absoluteModuleName*, *platform*), or continue.
3. Apply [redirections](#redirectmodulepath-string--string--false) to *moduleName*. If this results in an [empty module](#empty-module), then
    1. Return the empty module.
4. If [Haste resolutions are allowed](#allowhaste-boolean), then
    1. Get the result of [**RESOLVE_HASTE**](#resolve_haste)(*context*, *moduleName*, *platform*).
    2. If resolved as a Haste package path, then
        1. Perform the algorithm for resolving a path (step 2 above). Throw an error if this resolution fails.
            For example, if the Haste package path for `'a/b'` is `foo/package.json`, perform step 2 as if _moduleName_ was `foo/c`.
5. If [`context.disableHierarchicalLookup`](#disableHierarchicalLookup-boolean) is not `true`, then
    1. Try resolving _moduleName_ under `node_modules` from the current directory (i.e. parent of [`context.originModulePath`](#originmodulepath-string)) up to the root directory.
    2. Perform [**RESOLVE_PACKAGE**](#resolve_package)(*context*, *modulePath*, *platform*) for each candidate path.
6. For each element _nodeModulesPath_ of [`context.nodeModulesPaths`](#nodemodulespaths-readonlyarraystring):
    1. Try resolving _moduleName_ under _nodeModulesPath_ as if the latter was another `node_modules` directory (similar to step 5 above).
    2. Perform [**RESOLVE_PACKAGE**](#resolve_package)(*context*, *modulePath*, *platform*) for each candidate path.
7. If [`context.extraNodeModules`](#extranodemodules-string-string) is set:
    1. Split _moduleName_ into a package name (including an optional [scope](https://docs.npmjs.com/cli/v8/using-npm/scope)) and relative path.
    2. Look up the package name in [`context.extraNodeModules`](#extranodemodules-string-string). If found, then
        1. Construct a path _modulePath_ by replacing the package name part of _moduleName_ with the value found in [`context.extraNodeModules`](#extranodemodules-string-string)
        2. Return the result of [**RESOLVE_PACKAGE**](#resolve_package)(*context*, *modulePath*, *platform*).
8. If no valid resolution has been found, throw a resolution failure error.

#### RESOLVE_MODULE

Parameters: (*context*, *moduleName*, *platform*)

1. Let *filePath* be the result of applying [redirections](#redirectmodulepath-string--string--false) to *moduleName*. This may locate a replacement subpath from a containing `package.json` file based on the [`browser` field spec](https://github.com/defunctzombie/package-browser-field-spec).
2. Return the result of [**RESOLVE_FILE**](#resolve_file)(*context*, *filePath*, *platform*), or continue.
3. Otherwise, let *dirPath* be the directory path of *filePath*.
4. If a file *dirPath* + `'package.json'` exists, resolve based on the [`browser` field spec](https://github.com/defunctzombie/package-browser-field-spec):
    1. Let *mainModulePath* be the result of reading the package's entry path using [`context.mainFields`](#mainfields-readonlyarraystring).
    2. Return the result of [**RESOLVE_FILE**](#resolve_file)(*context*, *mainModulePath*, *platform*), or continue.
    3. Return the result of [**RESOLVE_FILE**](#resolve_file)(*context*, *mainModulePath* + `'/index'`, *platform*).
    4. Throw an error if no resolution could be found.

#### RESOLVE_PACKAGE

Parameters: (*context*, *moduleName*, *platform*)

1. If `context.enablePackageExports` is enabled, and a containing `package.json` file contains the field `"exports"`, get result of [**RESOLVE_PACKAGE_EXPORTS**](#resolve_package-exports)(*context*, *packagePath*, *filePath*, *exportsField*, *platform*).
    1. If resolved path exists, return result.
    2. Else, log either a package configuration or package encapsulation warning.
2. Return the result of [**RESOLVE_MODULE**](#resolve_module)(*context*, *filePath*, *platform*).

#### RESOLVE_PACKAGE_EXPORTS

Parameters: (*context*, *packagePath*, *filePath*, *exportsField*, *platform*)

> Resolves a package subpath based on the [Package Entry Points spec](https://nodejs.org/docs/latest-v19.x/api/packages.html#package-entry-points) (the `"exports"` field), when [`resolver.unstable_enablePackageExports`](./configuration#unstable_enablepackageexports-experimental) is enabled.

1. Let *subpath* be the relative path from *packagePath* to *filePath*, or `'.'`.
2. If *exportsField* contains an invalid configuration or values, raise an `InvalidPackageConfigurationError`.
3. If *subpath* is not defined by *exportsField*, raise a `PackagePathNotExportedError`.
4. Let *target* be the result of matching *subpath* in *exportsField* after applying any [conditional exports](https://nodejs.org/docs/latest-v19.x/api/packages.html#conditional-exports) and/or substituting a [subpath pattern match](https://nodejs.org/docs/latest-v19.x/api/packages.html#subpath-patterns).
    1. Condition names will be asserted from the union of `context.unstable_conditionNames` and `context.unstable_conditionNamesByPlatform` for *platform*, in the order defined by *exportsField*.
5. If *target* refers to an [asset](#assetexts-readonlysetstring), then
    1. Return the result of [**RESOLVE_ASSET**](#resolve_asset)(*context*, *target*, *platform*).
6. Return *target* as a [source file resolution](#source-file) **without** applying redirections or trying any platform or extension variants.

#### RESOLVE_FILE

Parameters: (*context*, *filePath*, *platform*)

1. If the path refers to an [asset](#assetexts-readonlysetstring), then
    1. Return the result of [**RESOLVE_ASSET**](#resolve_asset)(*context*, *filePath*, *platform*).
2. Otherwise, if the path [exists](#doesfileexist-string--boolean), then
    1. Try all platform and extension variants in sequence. Return a [source file resolution](#source-file) for the first one that [exists](#doesfileexist-string--boolean) after applying [redirections](#redirectmodulepath-string--string--false). For example, if _platform_ is `android` and [`context.sourceExts`](#sourceexts-readonlyarraystring) is `['js', 'jsx']`, try this sequence of potential file names:
        1. _moduleName_ + `'.android.js'`
        2. _moduleName_ + `'.native.js'` (if [`context.preferNativePlatform`](#prefernativeplatform-boolean) is `true`)
        3. _moduleName_ + `'.js'`
        4. _moduleName_ + `'.android.jsx'`
        5. _moduleName_ + `'.native.jsx'` (if [`context.preferNativePlatform`](#prefernativeplatform-boolean) is `true`)
        6. _moduleName_ + `'.jsx'`

#### RESOLVE_ASSET

Parameters: (*context*, *filePath*, *platform*)

1. Use [`context.resolveAsset`](#resolveasset-dirpath-string-assetname-string-extension-string--readonlyarraystring) to collect all asset variants.
2. Return an [asset resolution](#asset-files) containing the collected asset paths.

#### RESOLVE_HASTE

Parameters: (*context*, *moduleName*, *platform*)

1. Try resolving _moduleName_ as a [Haste module](#resolvehastemodule-string--string).
   If found, then
   1. Return result as a [source file resolution](#source-file) **without** applying redirections or trying any platform or extension variants.
2. Try resolving _moduleName_ as a [Haste package](#resolvehastepackage-string--string), or a path *relative* to a Haste package.
   For example, if _moduleName_ is `'a/b/c'`, try the following potential Haste package names:
   1. `'a/b/c'`, relative path `''`
   2. `'a/b'`, relative path `'./c'`
   3. `'a'`, with relative path `'./b/c'`

### Resolution context

#### `assetExts: $ReadOnlySet<string>`

The set of file extensions used to identify asset files. Defaults to [`resolver.assetExts`](./Configuration.md#assetexts).

#### `doesFileExist: string => boolean`

Returns `true` if the file with the given path exists, or `false` otherwise.

By default, Metro implements this by consulting an in-memory map of the filesystem that has been prepared in advance. This approach avoids disk I/O during module resolution.

#### `nodeModulesPaths: $ReadOnlyArray<string>`

A list of paths to check for modules after looking through all `node_modules` directories.

By default this is set to [`resolver.nodeModulesPaths`](./Configuration.md#nodemodulespaths)

#### `preferNativePlatform: boolean`

If `true`, try `.native.${ext}` before `.${ext}` and after `.${platform}.${ext}` during resolution. Metro sets this to `true`.

#### `redirectModulePath: string => string | false`

Rewrites a module path, or returns `false` to redirect to the special [empty module](#empty-module). In the default resolver, the resolution algorithm terminates with an [empty module result](#empty-module) if `redirectModulePath` returns `false`.

Metro uses this to implement the `package.json` [`browser` field spec](https://github.com/defunctzombie/package-browser-field-spec), particularly the ability to [replace](https://github.com/defunctzombie/package-browser-field-spec#replace-specific-files---advanced) and [ignore](https://github.com/defunctzombie/package-browser-field-spec#ignore-a-module) specific files.

The default implementation of this function respects [`resolver.resolverMainFields`](./Configuration.md#resolvermainfields).

#### `resolveAsset: (dirPath: string, assetName: string, extension: string) => ?$ReadOnlyArray<string>`

Given a directory path, the base asset name and an extension, returns a list of all the asset file names that match the given base name in that directory, or `null` if no such files are found. The default implementation considers each of [`resolver.assetResolutions`](./Configuration.md#assetresolutions) and uses the `${assetName}@${resolution}${extension}` format for asset variant file names.

See also [Static Image Resources](https://reactnative.dev/docs/images#static-image-resources) in the React Native docs.

#### `sourceExts: $ReadOnlyArray<string>`

The list of file extensions to try, in order, when resolving a module path that does not exist on disk. Defaults to [`resolver.sourceExts`](./Configuration.md#sourceexts).

#### `mainFields: $ReadOnlyArray<string>`

The ordered list of fields in `package.json` that should be read to resolve a package's main entry point (and any subpath file replacements) per the ["browser" field spec](https://github.com/defunctzombie/package-browser-field-spec). Defaults to [`resolver.resolverMainFields`](./Configuration.md#resolvermainfields).

#### `getPackage: string => PackageJson`

Given the path to a `package.json` file, returns the parsed file contents.

#### `getPackageForModule: (modulePath: string) => ?PackageInfo` <div class="label deprecated">Deprecated</div>

Given a module path that may exist under an npm package, locates and returns the package root path and parsed `package.json` contents.

#### `resolveHasteModule: string => ?string`

Resolves a Haste module name to an absolute path. Returns `null` if no such module exists.

The default implementation of this function uses [metro-file-map](https://www.npmjs.com/package/metro-file-map)'s `getModule` method.

#### `resolveHastePackage: string => ?string`

Resolves a Haste package name to an absolute `package.json` path. Returns `null` if no such package exists.

The default implementation of this function uses [metro-file-map](https://www.npmjs.com/package/metro-file-map)'s `getPackage` method.

#### `allowHaste: boolean`

`true` if Haste resolutions are allowed in the current context, `false` otherwise.

#### `disableHierarchicalLookup: boolean`

If `true`, the resolver should not perform lookup in `node_modules` directories per the Node resolution algorithm. Defaults to [`resolver.disableHierarchicalLookup`](./Configuration.md#disablehierarchicallookup).

#### `extraNodeModules: ?{[string]: string}`

A mapping of package names to directories that is consulted after the standard lookup through `node_modules` as well as any [`nodeModulesPaths`](#nodemodulespaths-readonlyarraystring).

#### `originModulePath: string`

The path to the current module, e.g. the one containing the `import` we are currently resolving.

#### `customResolverOptions: {[string]: mixed}`

Any custom options passed to the resolver. By default, Metro populates this based on URL parameters in the bundle request, e.g. `http://localhost:8081/index.bundle?resolver.key=value` becomes `{key: 'value'}`.

#### `resolveRequest: CustomResolver`

A alternative resolver function to which the current request may be delegated. Defaults to [`resolver.resolveRequest`](./Configuration.md#resolvereqeuest).

Metro expects `resolveRequest` to have the following signature:

```flow
function resolveRequest(
  context: ResolutionContext,
  moduleName: string,
  platform: string | null,
): Resolution {
  // ...
}

type Resolution =
  | {type: 'empty'}
  | {type: 'sourceFile', filePath: string}
  | {type: 'assetFiles', filePaths: $ReadOnlyArray<string>};
```

When calling the default resolver with a non-null `resolveRequest` function, it represents a custom resolver and will always be called, fully replacing the default resolution logic.

Inside a custom resolver, `resolveRequest` is set to the default resolver function, for easy chaining and customization.

## Caching

Resolver results may be cached under the following conditions:

1. For given origin module paths _A_ and _B_ and target module name _M_, the resolution for _M_ may be reused if **all** of the following conditions hold:
    1. _A_ and _B_ are in the same directory.
    2. The contents of [`customResolverOptions`](#customresolveroptions-string-mixed) are equivalent ( = serialize to JSON the same) in both calls to the resolver.
2. Any cache of resolutions must be invalidated if any file in the project has changed.

Custom resolvers must adhere to these assumptions, e.g. they may not return different resolutions for origin modules in the same directory under the same `customResolverOptions`.
