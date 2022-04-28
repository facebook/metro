---
id: bundling
title: Bundle Formats
---

When bundling, each of the modules gets assigned a numeric id, meaning no dynamic requires are supported. Requires are changed by its numeric version, and modules are stored in different possible formats. Three different formats of bundling are supported:

## Plain bundle

This is the standard bundling format. In this format, all files are wrapped with a function call, then added to the global file. This is useful for environments that expect a JS only bundle (e.g. a browser). Just requiring the entry point with the `.bundle` extension should trigger a build of it.

## Indexed RAM bundle

This format composes the bundle as a binary file, which format has the following parts (all numbers are expressed in Little Endian):

* A magic number: a `uint32` must be located at the beginning of the file, with the value `0xFB0BD1E5`. This is used to verify the file.
* An offset table: the table is a sequence of `uint32` pairs, with a header
    * For the header, two `uint32`s can be found: the length of the table, and the length of the startup code.
    * For the pairs, they represent the offset in the file and the length of code module, in bytes.
* Each of the modules, finished by a null byte (`\0`).

```
` 0                   1                   2                   3                   4                   5                   6
 0 1 2 3 4 5 6 7 8 9 0 1 2 3 4 5 6 7 8 9 0 1 2 3 4 5 6 7 8 9 0 1 2 3 4 5 6 7 8 9 0 1 2 3 4 5 6 7 8 9 0 1 2 3 4 5 6 7 8 9 0 1 2 3
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
|                          Magic number                         |                          Header size                          |
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
|                        Module n length                        | Module 0 code | Module 0 code |      ...      |       \0      |
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
| Module 1 code | Module 1 code |      ...      |       \0      |                                                               |
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+                                                               +
|                                                                                                                               |
+                                                              ...                                                              +
|                                                                                                                               |
+                                                               +-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
|                                                               | Module n code | Module n code |      ...      |       \0      |
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+`
```

This structure is optimal for an environment that is able to load all code in memory at once:

* By using the offset table, one can load any module in constant time, where the code for module `x` is located at `file[(x + 3) * sizeof(uint32)]`. Since there is a null character (`\0`) separating all modules, usually length does not even need to be used, and the module can be loaded directly as an ASCIIZ string.
* Startup code is always found at `file[sizeof(uint32)]`.

This bundling is usually used by iOS.

## File RAM bundle

Each module is stored as a file, with the name `js-modules/${id}.js`, plus an extra file called `UNBUNDLE` is created, which its only content is the magic number, `0xFB0BD1E5`. Note that the `UNBUNDLE` file is created at the root.
This bundling is usually used by Android, since package contents are zipped, and access to a zipped file is much faster. If the indexed format was used instead, all the bundled should be unzipped at once to get the code for the corresponding module.
