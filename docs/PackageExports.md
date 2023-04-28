---
id: package-exports
title: Package Exports Support (Experimental)
---

## Background

Introduced in Node.js 12.7.0, Package Exports is a modern approach for npm packages to specify **entry points** — the mapping of package subpaths which can be externally imported and which file(s) they should resolve to.

When Package Exports support is enabled via [`resolver.unstable_enablePackageExports`](/docs/configuration/#unstable_enablepackageexports-experimental), Metro's [module resolution algorithm](/docs/resolution#algorithm) will consider the `"exports"` field in `package.json` files.

- [Node.js spec](https://nodejs.org/docs/latest-v19.x/api/packages.html#package-entry-points)
- [RFC for Package Exports in Metro](https://github.com/react-native-community/discussions-and-proposals/blob/main/proposals/0534-metro-package-exports-support.md)
- React Native announcement post (coming soon!)

## Configuration options

| Option | Description |
| --- | --- |
| [`resolver.unstable_enablePackageExports`](/docs/configuration/#unstable_enablepackageexports-experimental) | Enable Package Exports support. |
| [`resolver.unstable_conditionNames`](/docs/configuration/#unstable_conditionnames-experimental) | The set of condition names to assert when resolving conditional exports. |
| [`resolver.unstable_conditionsByPlatform`](/docs/configuration/#unstable_conditionsbyplatform-experimental) | The additional condition names to assert when resolving for a given platform target. |

## Summary of breaking changes

:::info
**Package Exports resolution is available since Metro 0.76.1 and is disabled by default**. We will provide the option to disable it for a long time yet, and have no plans to remove existing non-`"exports"` resolution behaviour.
:::

Since Package Exports features overlap with existing React Native concepts (such as [platform-specific extensions](https://reactnative.dev/docs/platform-specific-code)), and since `"exports"` had been live in the npm ecosystem for some time, we reached out to the React Native community to make sure our implementation would meet developers' needs ([PR](https://github.com/react-native-community/discussions-and-proposals/pull/534), [final RFC](https://github.com/react-native-community/discussions-and-proposals/blob/main/proposals/0534-metro-package-exports-support.md)).

This led us to create an implementation of Package Exports in Metro that is spec-compliant (necessitating some breaking changes), but backwards compatible otherwise (helping apps with existing imports to migrate gradually).

### Breaking: Match `"exports"` first, then fall back to legacy resolution

If present in a `package.json` file, `"exports"` will be the first field consulted when resolving a package.

- `"exports"` will be used instead of any existing `"react-native"`, `"browser"`, or `"main"` field — or a file on disk at the same subpath (edge case).
- **Fallback**: If the requested subpath is not matched in `"exports"`, Metro will try to resolve it again, considering the above fields.

Subpaths matched in `"exports"` (including via [subpath patterns](https://nodejs.org/docs/latest-v19.x/api/packages.html#subpath-patterns)) will use the exact target file path specified by a package.
  - Metro will not expand [`sourceExts`](/docs/configuration/#sourceexts) against the import specifier.
  - Metro will not resolve [platform-specific extensions](https://reactnative.dev/docs/platform-specific-code) against the target file.
  - **Unchanged**: Metro will expand [asset densities](/docs/configuration#assetresolutions) (e.g. `icon.png` → `icon@2x.png`) if the target file [is an asset](/docs/configuration/#assetexts).

#### Example

For a package without an `"exports"` field, Metro tries multiple potential file locations based on the import specifier:

```js
import FooComponent from 'some-pkg/FooComponent';
// Tries .[platform].js, .native.js, .js (+ TypeScript variants)
```

However, if `"./FooComponent"` is listed in `"exports"`, Metro matches the import specifier to this subpath, and uses the target file specified by the package with no further rules:

```js
import FooComponent from 'some-pkg/FooComponent';
// Resolves exact target from "exports" only
```

:::note
We have no plans to drop platform-specific extensions for packages not using `"exports"`, or in app code.
:::

### Breaking: Import specifiers are matched exactly

Previously, import specifiers (the string given to `import` or `require()`) could be defined using both extensioned or extensionless paths. This is no longer the case for subpath keys in the `"exports"` field.

#### Example

```json
{
  "name": "some-pkg",
  "exports": {
    "./FooComponent": "./src/FooComponent.js"
  }
}
```

```js
import FooComponent from 'some-pkg/FooComponent.js';
// Inaccessible unless the package had also listed "./FooComponent.js"
// as an "exports" key
```

Note that this behaviour also applies for subpath patterns: `"./*": "./src/*.js"` is distinct from `"./*.js": "./src/*.js"`.

### Package encapsulation is lenient

In Node.js, it is an error to import package subpaths that aren't explicitly listed in `"exports"`. In Metro, we've decided to handle these errors leniently and resolve modules following the old behavior as necessary. This is intended to reduce user friction for previously allowed imports in existing Metro projects.

Instead of throwing an error, Metro will log a warning and fall back to file-based resolution.

```sh
warn: You have imported the module "foo/private/fn.js" which is not listed in
the "exports" of "foo". Consider updating your call site or asking the package
maintainer(s) to expose this API.
```

:::note
We plan to implement a strict mode for package encapsulation in future, to align with Node's default behavior. **We recommend that all developers fix encapsulation warnings in their code**.
:::
