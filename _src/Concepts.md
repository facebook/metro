---
id: concepts
title: Concepts
---

Metro is a JavaScript bundler. It takes in an entry file and various options, and gives you back a single JavaScript file that includes all your code and its dependencies.

Metro has three separate stages in its bundling process:

1. Resolution
2. Transformation
3. Serialization

### Resolution

Metro needs to build a graph of all the modules that are required from the entry point. To find which file is required from another file Metro uses a resolver. In reality this stage happens in parallel with the transformation stage.

### Transformation

All modules go through a transformer. A transformer is responsible for converting (transpiling) a module to a format that is understandable by the target platform (eg. React Native). Transformation of modules happens in parallel based on the amount of cores that you have.

### Serialization

As soon as all the modules have been transformed they will be serialized. A serializer combines the modules to generate one or multiple bundles. A bundle is literally a bundle of modules combined into a single JavaScript file.

## Modules

Metro has been split out into multiple modules corresponding to every step in the flow, each with their own responsibility. This means that we have a resolver, transformer, and serializer. These modules can be swapped out depending on your needs.
