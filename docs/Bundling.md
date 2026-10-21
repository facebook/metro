---
id: bundling
title: Bundle Formats
---

When bundling, each of the modules gets assigned a numeric id, meaning no dynamic requires are supported. Requires are changed by its numeric version, and modules are stored in different possible formats. Three different formats of bundling are supported:

## Plain bundle

This is the standard bundling format. In this format, all files are wrapped with a function call (`__d()`, which registers the module with Metro's module system), then concatenated into a single file. This is useful for environments that expect a JS only bundle (e.g. a browser). Just requiring the entry point with the `.bundle` extension should trigger a build of it.

## Indexed RAM bundle

RAM (Random Access Modules) bundles store each module separately, so the app can load a module's code only when it is first required.

This format composes the bundle as a binary file, which format has the following parts (all numbers are expressed in Little Endian):

* A magic number: a `uint32` must be located at the beginning of the file, with the value `0xFB0BD1E5`. This is used to verify the file.
* An offset table: the table is a sequence of `uint32` pairs, with a header
    * For the header, two `uint32`s can be found: the number of table entries (highest module id + 1), and the length of the startup code, in bytes.
    * For the pairs, they represent the offset of the module code relative to the start of the startup code, and the length of the module code, in bytes.
* The startup code, followed by each of the modules, each finished by a null byte (`\0`). The startup code runs when the bundle loads: polyfills, Metro's module system, [`preloadedModules`](./Configuration.md#gettransformoptions), and the call that runs the entry point.

```
` 0                   1                   2                   3                   4                   5                   6
 0 1 2 3 4 5 6 7 8 9 0 1 2 3 4 5 6 7 8 9 0 1 2 3 4 5 6 7 8 9 0 1 2 3 4 5 6 7 8 9 0 1 2 3 4 5 6 7 8 9 0 1 2 3 4 5 6 7 8 9 0 1 2 3
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
|                          Magic number                         |                       Number of entries                       |
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
|                       Startup code size                       |                        Module 0 offset                        |
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
|                        Module 0 length                        |                                                               |
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+                                                               +
|                                                                                                                               |
+                                                              ...                                                              +
|                                                                                                                               |
+                                                               +-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
|                                                               |                        Module n offset                        |
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
|                        Module n length                        | Startup code  | Startup code  |      ...      |       \0      |
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
| Module 0 code | Module 0 code |      ...      |       \0      |                                                               |
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+                                                               +
|                                                                                                                               |
+                                                              ...                                                              +
|                                                                                                                               |
+                                                               +-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
|                                                               | Module n code | Module n code |      ...      |       \0      |
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+`
```

This structure is optimal for an environment that is able to load all code in memory at once:

* By using the offset table, one can load any module in constant time, where the offset/length entry for module `x` is located at `file[(3 + 2 * x) * sizeof(uint32)]`, and its code starts at that offset from the start of the startup code. Since there is a null character (`\0`) separating all modules, usually length does not even need to be used, and the module can be loaded directly as a null-terminated (ASCIIZ) string.
* Startup code is always found right after the offset table, at `file[(3 + 2 * numEntries) * sizeof(uint32)]`.

This bundling is usually used by iOS.

## File RAM bundle

Each module is stored as a file, with the name `js-modules/${id}.js`, plus an extra file called `UNBUNDLE` is created, which its only content is the magic number, `0xFB0BD1E5`, and which marks the bundle as a file RAM bundle. Note that the `UNBUNDLE` file is created inside the `js-modules` directory, and the startup code is written to the bundle output file.
This bundling is usually used by Android, since package contents are zipped, and access to a zipped file is much faster. If the indexed format was used instead, all the bundled should be unzipped at once to get the code for the corresponding module.
