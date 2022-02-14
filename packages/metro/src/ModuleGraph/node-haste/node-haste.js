/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow
 * @format
 */

import type {Moduleish} from '../../node-haste/DependencyGraph/ModuleResolution';
import type {ResolveFn, TransformedCodeFile} from '../types.flow';
import type {Extensions, Path} from './node-haste.flow';
import type {CustomResolver} from 'metro-resolver';

import {ModuleMap} from 'jest-haste-map';

const {
  ModuleResolver,
} = require('../../node-haste/DependencyGraph/ModuleResolution');
const parsePlatformFilePath = require('../../node-haste/lib/parsePlatformFilePath');
const HasteFS = require('./HasteFS');
const Module = require('./Module');
const ModuleCache = require('./ModuleCache');
const defaults = require('metro-config/src/defaults/defaults');
const path = require('path');

type ResolveOptions = {|
  assetExts: Extensions,
  assetResolutions: $ReadOnlyArray<string>,
  +disableHierarchicalLookup: boolean,
  +emptyModulePath: string,
  extraNodeModules: {[id: string]: string, ...},
  mainFields: $ReadOnlyArray<string>,
  nodeModulesPaths: $ReadOnlyArray<string>,
  +platform: string,
  platforms?: $ReadOnlyArray<string>,
  resolveRequest?: ?CustomResolver,
  +sourceExts: Extensions,
  transformedFiles: {[path: Path]: TransformedCodeFile, ...},
|};

const NATIVE_PLATFORM = 'native';
const GENERIC_PLATFORM = 'g';
const PACKAGE_JSON = path.sep + 'package.json';
const NULL_MODULE: Moduleish = {
  path: '/',
  getPackage(): void {},
  isHaste() {
    throw new Error('not implemented');
  },
  getName() {
    throw new Error('not implemented');
  },
};

const NODE_MODULES = path.sep + 'node_modules' + path.sep;
const isNodeModules = file => file.includes(NODE_MODULES);

// This function maps the ModuleGraph data structure to jest-haste-map's ModuleMap
const createModuleMap = ({files, moduleCache, sourceExts, platforms}) => {
  const platformSet = new Set(
    (platforms ?? defaults.platforms).concat([NATIVE_PLATFORM]),
  );

  const map = new Map();

  files.forEach((filePath: string) => {
    if (isNodeModules(filePath)) {
      return;
    }
    let id;
    let module;
    if (filePath.endsWith(PACKAGE_JSON)) {
      module = moduleCache.getPackage(filePath);
      id = module.data.name;
    } else if (sourceExts.indexOf(path.extname(filePath).substr(1)) !== -1) {
      module = moduleCache.getModule(filePath);
      id = module.name;
    }

    if (!(id && module && module.isHaste())) {
      return;
    }

    const mapModule = map.get(id) || Object.create(null);

    const platform =
      parsePlatformFilePath(filePath, platformSet).platform || GENERIC_PLATFORM;

    const existingModule = mapModule[platform];
    // 0 = Module, 1 = Package in jest-haste-map
    mapModule[platform] = [filePath, module.type === 'Package' ? 1 : 0];

    if (existingModule && existingModule[0] !== filePath) {
      throw new Error(
        [
          '@providesModule naming collision:',
          `  Duplicate module name: \`${id}\``,
          `  Paths: \`${filePath}\` collides with \`${existingModule[0]}\``,
          '',
          'This error is caused by a @providesModule declaration ' +
            'with the same name across two different files.',
        ].join('\n'),
      );
    }

    map.set(id, mapModule);
  });
  return map;
};

exports.createResolveFn = function (options: ResolveOptions): ResolveFn {
  const {
    assetExts,
    assetResolutions,
    extraNodeModules,
    transformedFiles,
    sourceExts,
    platform,
    platforms,
  } = options;
  const files = Object.keys(transformedFiles);
  function getTransformedFile(path: string): TransformedCodeFile {
    const result = transformedFiles[path];
    if (!result) {
      throw new Error(`"${path} does not exist`);
    }
    return result;
  }

  const hasteFS = new HasteFS(files);
  const moduleCache = new ModuleCache(
    (filePath: string) => hasteFS.closest(filePath, 'package.json'),
    getTransformedFile,
  );

  const assetExtensions = new Set(assetExts.map(asset => '.' + asset));
  const isAssetFile = file => assetExtensions.has(path.extname(file));

  const moduleResolver = new ModuleResolver({
    dirExists: (filePath: string): boolean => hasteFS.dirExists(filePath),
    disableHierarchicalLookup: options.disableHierarchicalLookup,
    doesFileExist: (filePath: string): boolean => hasteFS.exists(filePath),
    emptyModulePath: options.emptyModulePath,
    extraNodeModules,
    isAssetFile,
    mainFields: options.mainFields,
    // $FlowFixMe -- error revealed by types-first codemod
    moduleCache,
    moduleMap: new ModuleMap({
      duplicates: new Map(),
      map: createModuleMap({files, moduleCache, sourceExts, platforms}),
      mocks: new Map(),
      rootDir: '',
    }),
    nodeModulesPaths: options.nodeModulesPaths,
    preferNativePlatform: true,
    projectRoot: '',
    resolveAsset: (
      dirPath: string,
      assetName: string,
      extension: string,
    ): ?$ReadOnlyArray<string> => {
      const basePath = dirPath + path.sep + assetName;
      const assets = [
        basePath + extension,
        ...assetResolutions.map(
          resolution => basePath + '@' + resolution + 'x' + extension,
        ),
      ].filter(candidate => hasteFS.exists(candidate));
      return assets.length ? assets : null;
    },
    resolveRequest: options.resolveRequest,
    sourceExts,
  });

  return (id: string, sourcePath: ?string) => {
    const from =
      sourcePath != null
        ? new Module(sourcePath, moduleCache, getTransformedFile(sourcePath))
        : NULL_MODULE;
    const allowHaste = !isNodeModules(from.path);
    // $FlowFixMe -- error revealed by types-first codemod
    return moduleResolver.resolveDependency(from, id, allowHaste, platform)
      .path;
  };
};
