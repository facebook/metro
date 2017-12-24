/**
 * Copyright (c) 2015-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 *
 * @flow
 * @format
 */

'use strict';

const AssetResolutionCache = require('../../node-haste/AssetResolutionCache');
const DependencyGraphHelpers = require('../../node-haste/DependencyGraph/DependencyGraphHelpers');
const FilesByDirNameIndex = require('../../node-haste/FilesByDirNameIndex');
const HasteFS = require('./HasteFS');
const Module = require('./Module');
const ModuleCache = require('./ModuleCache');
const ResolutionRequest = require('../../node-haste/DependencyGraph/ResolutionRequest');

const defaults = require('../../defaults');
const parsePlatformFilePath = require('../../node-haste/lib/parsePlatformFilePath');
const path = require('path');

const {
  ModuleResolver,
} = require('../../node-haste/DependencyGraph/ModuleResolution');
const {ModuleMap} = require('jest-haste-map');

import type {Moduleish} from '../../node-haste/DependencyGraph/ResolutionRequest';
import type {ResolveFn, TransformedCodeFile} from '../types.flow';
import type {Extensions, Path} from './node-haste.flow';

type ResolveOptions = {|
  assetExts: Extensions,
  extraNodeModules: {[id: string]: string},
  +sourceExts: Extensions,
  transformedFiles: {[path: Path]: TransformedCodeFile},
|};

const platforms = new Set(defaults.platforms);

const GENERIC_PLATFORM = 'g';
const PACKAGE_JSON = path.sep + 'package.json';
const NULL_MODULE: Moduleish = {
  path: '/',
  getPackage() {},
  hash() {
    throw new Error('not implemented');
  },
  readCached() {
    throw new Error('not implemented');
  },
  readFresh() {
    return Promise.reject(new Error('not implemented'));
  },
  isHaste() {
    throw new Error('not implemented');
  },
  getName() {
    throw new Error('not implemented');
  },
};

// This function maps the ModuleGraph data structure to jest-haste-map's ModuleMap
const createModuleMap = ({files, helpers, moduleCache, sourceExts}) => {
  const map = Object.create(null);
  files.forEach(filePath => {
    if (helpers.isNodeModulesDir(filePath)) {
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
    if (!map[id]) {
      map[id] = Object.create(null);
    }
    const platform =
      parsePlatformFilePath(filePath, platforms).platform || GENERIC_PLATFORM;

    const existingModule = map[id][platform];
    // 0 = Module, 1 = Package in jest-haste-map
    map[id][platform] = [filePath, module.type === 'Package' ? 1 : 0];

    if (existingModule && existingModule[0] !== filePath) {
      throw new Error(
        `@providesModule naming collision:\n` +
          `  Duplicate module name: \`${id}\`\n` +
          `  Paths: \`${filePath}\` collides with ` +
          `\`${existingModule[0]}\`\n\n` +
          'This error is caused by a @providesModule declaration ' +
          'with the same name across two different files.',
      );
    }
  });
  return map;
};

exports.createResolveFn = function(options: ResolveOptions): ResolveFn {
  const {assetExts, extraNodeModules, transformedFiles, sourceExts} = options;
  const files = Object.keys(transformedFiles);
  function getTransformedFile(path) {
    const result = transformedFiles[path];
    if (!result) {
      throw new Error(`"${path} does not exist`);
    }
    return result;
  }

  const helpers = new DependencyGraphHelpers({
    assetExts,
    providesModuleNodeModules: defaults.providesModuleNodeModules,
  });

  const hasteFS = new HasteFS(files);
  const moduleCache = new ModuleCache(
    filePath => hasteFS.closest(filePath, 'package.json'),
    getTransformedFile,
  );

  const resolutionRequests = {};
  const filesByDirNameIndex = new FilesByDirNameIndex(files);
  const assetResolutionCache = new AssetResolutionCache({
    assetExtensions: new Set(assetExts),
    getDirFiles: dirPath => filesByDirNameIndex.getAllFiles(dirPath),
    platforms,
  });
  const moduleResolver = new ModuleResolver({
    dirExists: filePath => hasteFS.dirExists(filePath),
    doesFileExist: filePath => hasteFS.exists(filePath),
    extraNodeModules,
    isAssetFile: filePath => helpers.isAssetFile(filePath),
    moduleCache,
    moduleMap: new ModuleMap({
      duplicates: Object.create(null),
      map: createModuleMap({files, helpers, moduleCache, sourceExts}),
      mocks: Object.create(null),
    }),
    preferNativePlatform: true,
    resolveAsset: (dirPath, assetName, platform) =>
      assetResolutionCache.resolve(dirPath, assetName, platform),
    sourceExts,
  });

  return (id, sourcePath, platform, _, callback) => {
    let resolutionRequest = resolutionRequests[platform];
    if (!resolutionRequest) {
      resolutionRequest = resolutionRequests[platform] = new ResolutionRequest({
        moduleResolver,
        entryPath: '',
        helpers,
        platform,
        moduleCache,
      });
    }

    const from =
      sourcePath != null
        ? new Module(sourcePath, moduleCache, getTransformedFile(sourcePath))
        : NULL_MODULE;
    return resolutionRequest.resolveDependency(from, id).path;
  };
};
