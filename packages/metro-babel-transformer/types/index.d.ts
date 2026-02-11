/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @format
 * @oncall react_native
 */

import type {BabelFileMetadata} from '@babel/core';
import type {File as BabelNodeFile} from '@babel/types';

import {transformFromAstSync} from '@babel/core';

type BabelTransformOptions = NonNullable<
  Parameters<typeof transformFromAstSync>[2]
>;
export type CustomTransformOptions = {
  [$$Key$$: string]: unknown;
};
export type TransformProfile = 'default' | 'hermes-stable' | 'hermes-canary';
type BabelTransformerOptions = Readonly<{
  customTransformOptions?: CustomTransformOptions;
  dev: boolean;
  enableBabelRCLookup?: boolean;
  enableBabelRuntime: boolean | string;
  extendsBabelConfigPath?: string;
  experimentalImportSupport?: boolean;
  hermesParser?: boolean;
  minify: boolean;
  platform: null | undefined | string;
  projectRoot: string;
  publicPath: string;
  unstable_transformProfile?: TransformProfile;
  globalPrefix: string;
  inlineRequires?: void;
}>;
export type BabelTransformerArgs = Readonly<{
  filename: string;
  options: BabelTransformerOptions;
  plugins?: BabelTransformOptions['plugins'];
  src: string;
}>;
export type BabelFileFunctionMapMetadata = Readonly<{
  names: ReadonlyArray<string>;
  mappings: string;
}>;
export type BabelFileImportLocsMetadata = ReadonlySet<string>;
export type MetroBabelFileMetadata = Omit<
  BabelFileMetadata,
  keyof {
    metro?:
      | null
      | undefined
      | {
          functionMap?: null | undefined | BabelFileFunctionMapMetadata;
          unstable_importDeclarationLocs?:
            | null
            | undefined
            | BabelFileImportLocsMetadata;
        };
  }
> & {
  metro?:
    | null
    | undefined
    | {
        functionMap?: null | undefined | BabelFileFunctionMapMetadata;
        unstable_importDeclarationLocs?:
          | null
          | undefined
          | BabelFileImportLocsMetadata;
      };
};
export type BabelTransformer = Readonly<{
  transform: ($$PARAM_0$$: BabelTransformerArgs) => Readonly<{
    ast: BabelNodeFile;
    functionMap?: BabelFileFunctionMapMetadata;
    metadata?: MetroBabelFileMetadata;
  }>;
  getCacheKey?: () => string;
}>;
declare function transform(
  $$PARAM_0$$: BabelTransformerArgs,
): ReturnType<BabelTransformer['transform']>;
export {transform};
/**
 * Backwards-compatibility with CommonJS consumers using interopRequireDefault.
 * Do not add to this list.
 *
 * @deprecated Default import from 'metro-babel-transformer' is deprecated, use named exports.
 */
declare const $$EXPORT_DEFAULT_DECLARATION$$: {transform: typeof transform};
declare type $$EXPORT_DEFAULT_DECLARATION$$ =
  typeof $$EXPORT_DEFAULT_DECLARATION$$;
export default $$EXPORT_DEFAULT_DECLARATION$$;
