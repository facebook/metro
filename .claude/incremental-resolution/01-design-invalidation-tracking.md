# Incremental Resolution: Invalidation Tracking Design

## Goal

Capture invalidation dependencies on each `BundlerResolution`, so that when file system changes occur, we can efficiently determine which resolutions need to be re-run.

## Invalidation Categories

### 1. Path Existence (`existenceInvalidations`)
A resolution is invalidated if the existence of a specific file or directory path changes (added or removed).

**Sources:**
- `fileSystemLookup(path)` — the resolver probes many paths (with various extensions, platforms, etc.) and the resolution depends on which ones exist and which don't
- `doesFileExist(path)` — deprecated but still used, same as above
- `hierarchicalLookup()` — walks up directory tree looking for package.json; already has `invalidatedBy` pattern
- `resolveAsset()` — probes for asset files at various resolutions

**What to capture:** Every path passed to `fileSystemLookup` / `doesFileExist`, because:
- If a **missing** path is later **added**, the resolution might change
- If an **existing** path is later **removed**, the resolution might change

The existing `LookupResult` from TreeFS already returns the real path (for existing) or first missing path segment (for non-existing). We capture the real path for existing lookups and the `missing` path for non-existing lookups.

### 2. File Content (`contentInvalidations`)
A resolution is invalidated if the content of a specific file changes.

**Sources:**
- `getPackage(packageJsonPath)` — reads and parses package.json; if its content changes (e.g. `main` field, `exports` map, `browser` field), the resolution may change
- `getPackageForModule(absolutePath)` — finds closest package.json and reads it

**What to capture:** The absolute path of any package.json that was read during resolution.

### 3. Haste Name (`hasteInvalidations`)
A resolution is invalidated if the Haste mapping for a specific name changes — i.e., if any file providing that Haste name is added, removed, or changes which file wins.

**Sources:**
- `resolveHasteModule(name)` — looks up a Haste module name
- `resolveHastePackage(name)` — looks up a Haste package name

**What to capture:** The Haste name that was looked up. This is a compact representation — the Haste map itself tracks which files provide which names, so we just need the name.

## Data Structure

```flow
type ResolutionInvalidations = Readonly<{
  // Paths whose existence (added/removed) would invalidate this resolution.
  // Includes both paths that exist (removal invalidates) and paths that
  // don't exist (addition invalidates).
  pathExistence: ReadonlySet<string>,

  // Paths whose content change would invalidate this resolution
  // (e.g. package.json files that were read).
  fileContent: ReadonlySet<string>,

  // Haste names that were looked up. Any change to which file provides
  // this name (or whether it's provided at all) invalidates.
  hasteNames: ReadonlySet<string>,
}>;
```

## Updated BundlerResolution

```flow
export type BundlerResolution = Readonly<{
  type: 'sourceFile',
  filePath: string,
  unstable_invalidations?: ResolutionInvalidations,
}>;
```

The `unstable_invalidations` field is optional:
- Present when `unstable_incrementalResolution` is enabled
- Absent when using the traditional resolution cache (no tracking needed)

## Context Wrapping Strategy

In `ModuleResolution.resolveDependency()`, when `unstable_incrementalResolution` is true, we wrap the context methods to collect invalidation data:

```
// Pseudocode
const pathExistence = new Set<string>();
const fileContent = new Set<string>();
const hasteNames = new Set<string>();

wrappedContext = {
  ...context,
  fileSystemLookup: (path) => {
    const result = context.fileSystemLookup(path);
    pathExistence.add(result.exists ? result.realPath : path);
    return result;
  },
  doesFileExist: (path) => {
    const result = context.doesFileExist(path);
    pathExistence.add(path); // Simplified - ideally we'd get the realPath
    return result;
  },
  getPackage: (pkgPath) => {
    const result = context.getPackage(pkgPath);
    if (result != null) {
      fileContent.add(pkgPath);
    }
    return result;
  },
  resolveHasteModule: (name) => {
    hasteNames.add(name);
    return context.resolveHasteModule(name);
  },
  resolveHastePackage: (name) => {
    hasteNames.add(name);
    return context.resolveHastePackage(name);
  },
};
```

## Key Design Decisions

1. **No public API change**: `unstable_invalidations` is an internal field on `BundlerResolution`, gated behind the existing `unstable_incrementalResolution` flag.

2. **Efficient wrapping**: Only wrap when `unstable_incrementalResolution` is true. The wrapping overhead is minimal (Set.add per call).

3. **Use TreeFS return values**: `fileSystemLookup` returns `realPath` for existing paths and we can use the input path for non-existing. This correctly handles symlinks.

4. **Compact Haste representation**: Instead of tracking all files that could provide a Haste name, we just track the name. The invalidation check is: "did any file with this Haste name get added/removed/modified?"

5. **hierarchicalLookup already supports this**: TreeFS's `hierarchicalLookup` has an `invalidatedBy: Set<string>` parameter. We'll pass a real Set instead of null when incremental resolution is enabled.

## Invalidation Check (Future)

Given a `ChangeEvent` with added/modified/removed files:
```
shouldInvalidate(resolution, changes):
  for path in changes.addedFiles ∪ changes.removedFiles:
    if path ∈ resolution.pathExistence → INVALIDATE
  for path in changes.modifiedFiles:
    if path ∈ resolution.fileContent → INVALIDATE
  for name in resolution.hasteNames:
    if name ∈ changes.affectedHasteNames → INVALIDATE
  return KEEP
```

## Implementation Order

1. ✅ Add `ResolutionInvalidations` type to `types.js`
2. ✅ Add `unstable_invalidations` to `BundlerResolution`
3. ✅ Implement context wrapping in `ResolutionTracker` class (ModuleResolution.js)
4. ✅ Wire up `hierarchicalLookup` invalidatedBy through PackageCache → DependencyGraph
5. Build invalidation checking in `DependencyGraph._onHasteChange()`

## Implementation Notes

### hierarchicalLookup wiring
TreeFS's `hierarchicalLookup` API was split from a single `invalidatedBy` set
into two separate parameters:
- `invalidatedByExistence: ?Set<string>` — paths whose addition/removal
  would invalidate the result (via explicit `.add()` calls in TreeFS)
- `invalidatedByModification: ?Set<string>` — symlinks traversed during the
  lookup, whose modification (target change) would invalidate the result
  (via `collectLinkPaths` in `#lookupByNormalPath`)

This separation is important because symlink modifications are **file content
changes** (the symlink still exists, but its target changed), not existence
changes. A regular file could also become a symlink or vice-versa at the same
path, which is simply a "modified file" either way.

The call chain is:
```
ResolutionTracker.getPackageForModule(path)
  → ModuleResolution._getPackageForModule(path, pathExistence, fileContent)
    → PackageCache.getPackageOf(path, pathExistence, fileContent)
      → DependencyGraph._getClosestPackage(path, pathExistence, fileContent)
        → TreeFS.hierarchicalLookup(path, 'package.json', {
            invalidatedByExistence: pathExistence,
            invalidatedByModification: fileContent,
          })
```

### PackageCache caching correctness
`PackageCache` caches the result of `hierarchicalLookup`. To correctly support
invalidation tracking with caching:

1. **Cache miss (tracked)**: Allocate **fresh** sets for `hierarchicalLookup`,
   then copy the fresh paths into the caller's sets AND store them in the cache.
   This avoids caching the caller's pre-existing invalidation paths.

2. **Cache hit (stored paths exist)**: Replay stored paths into the caller's sets.

3. **Cache hit (no stored paths)**: If the initial miss was from a non-tracking
   caller, re-run `hierarchicalLookup` to collect the paths, store for future hits.

### `resolveAsset` tracking
The `resolveAsset` closure in `DependencyGraph._createModuleResolver()` captures
the *unwrapped* `fileSystemLookup` - so calls from `resolveAsset` to
`fileSystemLookup` don't go through our tracking wrapper in `ModuleResolution`.
We handle this by explicitly tracking in `trackedResolveAsset`:
- For found assets: add each result path to `pathExistence`
- For not-found assets: add the base path to `pathExistence`

### `doesFileExist` tracking
`doesFileExist` is deprecated in favor of `fileSystemLookup`, but still used.
We track the raw file path (not a real path, since `doesFileExist` returns only
a boolean). This is slightly less precise than `fileSystemLookup` tracking
(which gives us the realPath for existing files), but sufficient for invalidation.

### Empty module resolution
`_getEmptyModule()` resolves the empty module path and caches it. Since the
empty module path is a config constant, it doesn't need invalidation tracking.
The `invalidations` field will be present on it when `unstable_incrementalResolution`
is enabled, but it will only contain the paths probed during resolution of
the empty module itself.
