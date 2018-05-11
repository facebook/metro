/**
 * Copyright (c) 2016-present, Facebook, Inc.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow
 * @format
 */

'use strict';

const AssetPaths = require('../../node-haste/lib/AssetPaths');
const JsFileWrapping = require('./JsFileWrapping');
const Platforms = require('./Platforms');

const collectDependencies = require('./collectDependencies');
const crypto = require('crypto');
const defaults = require('../../defaults');
const docblock = require('jest-docblock');
const generate = require('./generate');
const getImageSize = require('image-size');
const invariant = require('fbjs/lib/invariant');
const path = require('path');

const {isAssetTypeAnImage} = require('../../Bundler/util');
const {basename} = require('path');

import type {Transformer} from '../../JSTransformer/worker';
import type {
  ImageSize,
  TransformedCodeFile,
  TransformedSourceFile,
  TransformResult,
  TransformVariants,
} from '../types.flow';
import type {Ast} from '@babel/core';

export type TransformOptions<ExtraOptions> = {|
  +asyncRequireModulePath: string,
  filename: string,
  hasteImplModulePath?: string,
  polyfill?: boolean,
  +sourceExts: Set<string>,
  transformer: Transformer<ExtraOptions>,
  variants?: TransformVariants,
|};

const NODE_MODULES = path.sep + 'node_modules' + path.sep;
const defaultTransformOptions = {
  dev: false,
  hot: false,
  inlineRequires: false,
  minify: true,
  platform: '',
  projectRoot: '',
};
const defaultVariants = {default: {}};

const ASSET_EXTENSIONS = new Set(defaults.assetExts);

function transformModule(
  content: Buffer,
  options: TransformOptions<{+retainLines?: boolean}>,
): TransformedSourceFile {
  const ext = path.extname(options.filename).substr(1);
  if (ASSET_EXTENSIONS.has(ext)) {
    return transformAsset(content, options.filename);
  }
  if (ext === 'json') {
    return transformJSON(content.toString('utf8'), options);
  }
  if (!options.sourceExts.has(ext)) {
    return {type: 'unknown'};
  }

  const sourceCode = content.toString('utf8');
  const {filename, transformer, polyfill, variants = defaultVariants} = options;
  const transformed: {[key: string]: TransformResult} = {};

  for (const variantName of Object.keys(variants)) {
    const {ast} = transformer.transform({
      filename,
      localPath: filename,
      options: {...defaultTransformOptions, ...variants[variantName]},
      src: sourceCode,
    });
    invariant(ast != null, 'ast required from the transform results');
    const {asyncRequireModulePath} = options;
    transformed[variantName] = makeResult({
      ast,
      asyncRequireModulePath,
      filename,
      isPolyfill: polyfill || false,
      sourceCode,
    });
  }

  let hasteID = null;
  if (filename.indexOf(NODE_MODULES) === -1 && !polyfill) {
    if (options.hasteImplModulePath != null) {
      // eslint-disable-next-line no-useless-call
      const HasteImpl = (require.call(
        null,
        options.hasteImplModulePath,
      ): HasteImpl);
      hasteID = HasteImpl.getHasteName(filename);
    } else {
      hasteID = docblock.parse(docblock.extract(sourceCode)).providesModule;
    }
  }

  return {
    details: {
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
  const code = JsFileWrapping.wrapJson(json);

  const moduleData = {
    code,
    map: null, // no source map for JSON files!
    dependencies: [],
    requireName: '_require', // not relevant for JSON files
  };
  const transformed = {};

  Object.keys(options.variants || defaultVariants).forEach(
    key => (transformed[key] = moduleData),
  );

  const result: TransformedCodeFile = {
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

function transformAsset(
  content: Buffer,
  filePath: string,
): TransformedSourceFile {
  const assetData = AssetPaths.parse(filePath, Platforms.VALID_PLATFORMS);
  const contentType = path.extname(filePath).slice(1);
  const details = {
    assetPath: assetData.assetName,
    contentBase64: content.toString('base64'),
    contentType,
    hash: crypto
      .createHash('sha1')
      .update(content)
      .digest('base64'),
    filePath,
    physicalSize: getAssetSize(contentType, content, filePath),
    platform: assetData.platform,
    scale: assetData.resolution,
  };
  return {details, type: 'asset'};
}

function getAssetSize(
  type: string,
  content: Buffer,
  filePath: string,
): ?ImageSize {
  if (!isAssetTypeAnImage(type)) {
    return null;
  }
  if (content.length === 0) {
    throw new Error(`Image asset \`${filePath}\` cannot be an empty file.`);
  }
  const {width, height} = getImageSize(content);
  return {width, height};
}

function makeResult(options: {|
  +ast: Ast,
  +asyncRequireModulePath: string,
  +filename: string,
  +isPolyfill: boolean,
  +sourceCode: string,
|}) {
  let dependencies, dependencyMapName;
  let requireName = 'require';
  let {ast} = options;

  if (options.isPolyfill) {
    dependencies = [];
    ast = JsFileWrapping.wrapPolyfill(ast);
  } else {
    const {asyncRequireModulePath} = options;
    const opts = {asyncRequireModulePath, dynamicRequires: 'reject'};
    ({dependencies, dependencyMapName} = collectDependencies(ast, opts));
    ({ast, requireName} = JsFileWrapping.wrapModule(ast, dependencyMapName));
  }
  const {filename, sourceCode} = options;
  const gen = generate(ast, filename, sourceCode, false);
  return {
    code: gen.code,
    map: gen.map,
    dependencies,
    dependencyMapName,
    requireName,
  };
}

module.exports = transformModule;
