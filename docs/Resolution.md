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

Given a [resolution context](#resolution-context) _context_, a module name _moduleName_, and an optional platform identifier _platform_, Metro's resolver either returns one of the [resolution types](#resolution-types), or throws an error.

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

1. If a [custom resolver](#resolverequest-customresolver) is defined, call it and return the result.

2. Otherwise, try to resolve _moduleName_ as a relative or absolute path:
    1. If the path is relative, convert it to an absolute path by prepending the current directory (i.e. parent of [`context.originModulePath`](#originmodulepath-string)).
    2. If the path refers to an [asset](#isassetfile-string--boolean):

        1. Use [`context.resolveAsset`](#resolveasset-dirpath-string-assetname-string-extension-string--readonlyarraystring) to collect all asset variants.
        2. Return an [asset resolution](#asset-files) containing the collected asset paths.

    3. If the path refers to a file that [exists](#doesfileexist-string--boolean) after applying [redirections](#redirectmodulepath-string--string--false), return it as a [source file resolution](#source-file).
    4. Try all platform and extension variants in sequence. Return a [source file resolution](#source-file) for the first one that [exists](#doesfileexist-string--boolean) after applying [redirections](#redirectmodulepath-string--string--false).
       For example, if _platform_ is `android` and [`context.sourceExts`](#sourceexts-readonlyarraystring) is `['js', 'jsx']`, try this sequence of potential file names:

        1. _moduleName_ + `'.android.js'`
        2. _moduleName_ + `'.native.js'` (if [`context.preferNativePlatform`](#prefernativeplatform-boolean) is `true`)
        3. _moduleName_ + `'.android.jsx'`
        4. _moduleName_ + `'.native.jsx'` (if [`context.preferNativePlatform`](#prefernativeplatform-boolean) is `true`)

    5. If a file named _moduleName_ + `'/package.json'` [exists](#doesfileexist-string--boolean):

        1. [Get the package's entry path](#getpackagemainpath-string--string).
        2. Try to resolve the entry path as a file, after applying [redirections](#redirectmodulepath-string--string--false) and trying all platform and extension variants as described above.
        3. Try to resolve the entry path + `'/index'` as a file, after applying [redirections](#redirectmodulepath-string--string--false) and trying all platform and extension variants as described above.
        4. Throw an error if no resolution could be found.

    6. Try to resolve _moduleName_ + `'/index'` as a file, after applying [redirections](#redirectmodulepath-string--string--false) and trying all platform and extension variants as described above.


3. Apply [redirections](#redirectmodulepath-string--string--false) to _moduleName_. Skip the rest of this algorithm if this results in an [empty module](#empty-module).

4. If [Haste resolutions are allowed](#allowhaste-boolean):

    1. Try resolving _moduleName_ as a [Haste module](#resolvehastemodule-string--string).
       If found, return it as a [source file resolution](#source-file) **without** applying redirections or trying any platform or extension variants.
    2. Try resolving _moduleName_ as a [Haste package](#resolvehastepackage-string--string), or a path *relative* to a Haste package.
       For example, if _moduleName_ is `'a/b/c'`, try the following potential Haste package names:

       1. `'a/b/c'`, relative path `''`
       2. `'a/b'`, relative path `'./c'`
       3. `'a'`, with relative path `'./b/c'`
    4. If resolved as a Haste package path, perform the algorithm for resolving a path (step 2 above). Throw an error if this resolution fails.
       For example, if the Haste package path for `'a/b'` is `foo/package.json`, perform step 2 as if _moduleName_ was `foo/c`.

5. If [`context.disableHierarchicalLookup`](#disableHierarchicalLookup-boolean) is not `true`:

    1. Try resolving _moduleName_ under `node_modules` from the current directory (i.e. parent of [`context.originModulePath`](#originmodulepath-string)) up to the root directory.
    2. Perform the algorithm for resolving a path (step 2 above) for each candidate path.

6. For each element _nodeModulesPath_ of [`context.nodeModulesPaths`](#nodemodulespaths-readonlyarraystring):

    1. Try resolving _moduleName_ under _nodeModulesPath_ as if the latter was another `node_modules` directory (similar to step 5 above).
    2. Perform the algorithm for resolving a path (step 2 above) for each candidate path.

5. If [`context.extraNodeModules`](#extranodemodules-string-string) is set:

    1. Split _moduleName_ into a package name (including an optional [scope](https://docs.npmjs.com/cli/v8/using-npm/scope)) and relative path.
    2. Look up the package name in [`context.extraNodeModules`](#extranodemodules-string-string). If found, construct a path by replacing the package name part of _moduleName_ with the value found in [`context.extraNodeModules`](#extranodemodules-string-string), and perform the algorithm for resolving a path (step 2 above).

6. If no valid resolution has been found, throw a resolution failure error.

### Resolution context

#### `doesFileExist: string => boolean`

Returns `true` if the file with the given path exists, or `false` otherwise.

By default, Metro implements this by consulting an in-memory map of the filesystem that has been prepared in advance. This approach avoids disk I/O during module resolution.

#### `isAssetFile: string => boolean`

Returns `true` if the given path represents an asset file, or `false` otherwise.

By default, Metro implements this by checking the file's extension against [`resolver.assetExts`](./Configuration.md#assetexts).

#### `nodeModulesPaths: $ReadOnlyArray<string>`

A list of paths to check for modules after looking through all `node_modules` directories.

By default this is set to [`resolver.nodeModulesPaths`](./Configuration.md#nodemodulespaths)

#### `preferNativePlatform: boolean`

Whether to prefer `.native.${ext}` over `.${platform}.${ext}` during resolution. Metro sets this to `true`.

#### `redirectModulePath: string => string | false`

Rewrites a module path, or returns `false` to redirect to the special [empty module](#empty-module). In the default resolver, the resolution algorithm terminates with an [empty module result](#empty-module) if `redirectModulePath` returns `false`.

Metro uses this to implement the `package.json` [`browser` field spec](https://github.com/defunctzombie/package-browser-field-spec), particularly the ability to [replace](https://github.com/defunctzombie/package-browser-field-spec#replace-specific-files---advanced) and [ignore](https://github.com/defunctzombie/package-browser-field-spec#ignore-a-module) specific files.

The default implementation of this function respects [`resolver.resolverMainFields`](./Configuration.md#resolvermainfields).

#### `resolveAsset: (dirPath: string, assetName: string, extension: string) => ?$ReadOnlyArray<string>`

Given a directory path, the base asset name and an extension, returns a list of all the asset file names that match the given base name in that directory, or `null` if no such files are found. The default implementation considers each of [`resolver.assetResolutions`](./Configuration.md#assetresolutions) and uses the `${assetName}@${resolution}${extension}` format for asset variant file names.

See also [Static Image Resources](https://reactnative.dev/docs/images#static-image-resources) in the React Native docs.

#### `sourceExts: $ReadOnlyArray<string>`

The list of file extensions to try, in order, when resolving a module path that does not exist on disk. Defaults to [`resolver.sourceExts`](./Configuration.md#sourceexts).

#### `getPackageMainPath: string => string`

Given the path to a `package.json` file, returns the contents of the `main` field, or the appropriate alternative field describing the entry point (e.g. `browser`).

The default implementation of this function respects [`resolver.resolverMainFields`](./Configuration.md#resolvermainfields).

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

#### `resolveRequest: CustomResolver`

A alternative resolver function to which the current request may be delegated. Defaults to [`resolver.resolveRequest`](./Configuration.md#resolvereqeuest).

When calling the default resolver with a non-null `resolveRequest` function, it represents a custom resolver and will always be called, fully replacing the default resolution logic.

Inside a custom resolver, `resolveRequest` is set to the default resolver function, for easy chaining and customisation.

## Caching

Resolver results may be cached under the following conditions:

1. For given origin module paths _A_ and _B_ and target module name _M_, the resolution for _M_ may be reused if _A_ and _B_ are in the same directory.
2. Any cache of resolutions must be invalidated if any file in the project has changed.

Custom resolvers must adhere to these assumptions, e.g. they may not return different resolutions for origin modules in the same directory.
