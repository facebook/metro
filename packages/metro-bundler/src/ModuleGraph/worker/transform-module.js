/**
 * Copyright (c) 2016-present, Facebook, Inc.
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

const AssetPaths = require('../../node-haste/lib/AssetPaths');
const JsFileWrapping = require('./JsFileWrapping');
const Platforms = require('./Platforms');

const collectDependencies = require('./collect-dependencies');
const defaults = require('../../defaults');
const docblock = require('jest-docblock');
const generate = require('./generate');
const getImageSize = require('image-size');
const invariant = require('fbjs/lib/invariant');
const path = require('path');

const {isAssetTypeAnImage} = require('../../Bundler/util');
const {basename} = require('path');

import type {HasteImpl} from '../../node-haste/Module';
import type {
  ImageSize,
  TransformedCodeFile,
  TransformedSourceFile,
  Transformer,
  TransformResult,
  TransformVariants,
} from '../types.flow';
import type {Ast} from 'babel-core';

export type TransformOptions<ExtraOptions> = {|
  filename: string,
  hasteImpl?: HasteImpl,
  polyfill?: boolean,
  transformer: Transformer<ExtraOptions>,
  variants?: TransformVariants,
|};

const NODE_MODULES = path.sep + 'node_modules' + path.sep;
const defaultTransformOptions = {
  dev: false,
  generateSourceMaps: true,
  hot: false,
  inlineRequires: false,
  platform: '',
  projectRoot: '',
};
const defaultVariants = {default: {}};

const ASSET_EXTENSIONS = new Set(defaults.assetExts);

function transformModule(
  content: Buffer,
  options: TransformOptions<{+retainLines?: boolean}>,
): TransformedSourceFile {
  if (ASSET_EXTENSIONS.has(path.extname(options.filename).substr(1))) {
    return transformAsset(content, options);
  }

  const code = content.toString('utf8');
  if (options.filename.endsWith('.json')) {
    return transformJSON(code, options);
  }

  const {filename, transformer, polyfill, variants = defaultVariants} = options;
  const transformed: {[key: string]: TransformResult} = {};

  for (const variantName of Object.keys(variants)) {
    const {ast} = transformer.transform({
      filename,
      localPath: filename,
      options: {...defaultTransformOptions, ...variants[variantName]},
      src: code,
    });
    invariant(ast != null, 'ast required from the transform results');
    transformed[variantName] = makeResult(ast, filename, code, polyfill);
  }

  let hasteID = null;
  if (filename.indexOf(NODE_MODULES) === -1) {
    hasteID = docblock.parse(docblock.extract(code)).providesModule;
    if (options.hasteImpl) {
      if (options.hasteImpl.enforceHasteNameMatches) {
        options.hasteImpl.enforceHasteNameMatches(filename, hasteID);
      }
      hasteID = options.hasteImpl.getHasteName(filename);
    }
  }

  return {
    details: {
      assetContent: null,
      code,
      file: filename,
      hasteID: hasteID || null,
      transformed,
      type: options.polyfill ? 'script' : 'module',
    },
    type: 'code',
  };
}

function transformJSON(json, options): TransformedSourceFile {
  const value = JSON.parse(json);
  const {filename} = options;
  const code = `__d(function(${JsFileWrapping.MODULE_FACTORY_PARAMETERS.join(
    ', ',
  )}) { module.exports = \n${json}\n});`;

  const moduleData = {
    code,
    map: null, // no source map for JSON files!
    dependencies: [],
  };
  const transformed = {};

  Object.keys(options.variants || defaultVariants).forEach(
    key => (transformed[key] = moduleData),
  );

  const result: TransformedCodeFile = {
    assetContent: null,
    code: json,
    file: filename,
    hasteID: value.name,
    transformed,
    type: 'module',
  };

  if (basename(filename) === 'package.json') {
    result.package = {
      name: value.name,
      main: value.main,
      browser: value.browser,
      'react-native': value['react-native'],
    };
  }
  return {type: 'code', details: result};
}

function transformAsset<ExtraOptions: {}>(
  content: Buffer,
  options: TransformOptions<ExtraOptions>,
): TransformedSourceFile {
  const filePath = options.filename;
  const assetData = AssetPaths.parse(filePath, Platforms.VALID_PLATFORMS);
  const contentType = path.extname(filePath).slice(1);
  const details = {
    assetPath: assetData.assetName,
    contentBase64: content.toString('base64'),
    contentType,
    filePath,
    physicalSize: getAssetSize(contentType, content),
    platform: assetData.platform,
    scale: assetData.resolution,
  };
  return {details, type: 'asset'};
}

function getAssetSize(type: string, content: Buffer): ?ImageSize {
  if (!isAssetTypeAnImage(type)) {
    return null;
  }
  const {width, height} = getImageSize(content);
  return {width, height};
}

function makeResult(ast: Ast, filename, sourceCode, isPolyfill = false) {
  let dependencies, dependencyMapName, file;
  if (isPolyfill) {
    dependencies = [];
    file = JsFileWrapping.wrapPolyfill(ast);
  } else {
    ({dependencies, dependencyMapName} = collectDependencies(ast));
    file = JsFileWrapping.wrapModule(ast, dependencyMapName);
  }

  const gen = generate(file, filename, sourceCode, false);
  return {code: gen.code, map: gen.map, dependencies, dependencyMapName};
}

module.exports = transformModule;
