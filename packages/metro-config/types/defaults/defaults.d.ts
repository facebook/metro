/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @format
 * @oncall react_native
 */

import type {RootPerfLogger} from '../types';

export {default as defaultCreateModuleIdFactory} from './createModuleIdFactory';
export declare const assetExts: Array<string>;
export declare type assetExts = typeof assetExts;
export declare const assetResolutions: Array<string>;
export declare type assetResolutions = typeof assetResolutions;
export declare const sourceExts: Array<string>;
export declare type sourceExts = typeof sourceExts;
export declare const additionalExts: Array<string>;
export declare type additionalExts = typeof additionalExts;
export declare const moduleSystem: string;
export declare type moduleSystem = typeof moduleSystem;
export declare const platforms: Array<string>;
export declare type platforms = typeof platforms;
export declare const DEFAULT_METRO_MINIFIER_PATH: 'metro-minify-terser';
export declare type DEFAULT_METRO_MINIFIER_PATH =
  typeof DEFAULT_METRO_MINIFIER_PATH;
export declare const noopPerfLoggerFactory: () => RootPerfLogger;
export declare type noopPerfLoggerFactory = typeof noopPerfLoggerFactory;
