/**
 * Copyright (c) 2015-present, Facebook, Inc.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow
 * @format
 */

'use strict';

export type Result<+TResolution, +TCandidates> =
  | {|+type: 'resolved', +resolution: TResolution|}
  | {|+type: 'failed', +candidates: TCandidates|};

export type Resolution = FileResolution | {|+type: 'empty'|};

export type AssetFileResolution = $ReadOnlyArray<string>;
export type FileResolution =
  | {|+type: 'sourceFile', +filePath: string|}
  | {|+type: 'assetFiles', +filePaths: AssetFileResolution|};

export type FileAndDirCandidates = {|
  +dir: FileCandidates,
  +file: FileCandidates,
|};

/**
 * This is a way to describe what files we tried to look for when resolving
 * a module name as file. This is mainly used for error reporting, so that
 * we can explain why we cannot resolve a module.
 */
export type FileCandidates =
  // We only tried to resolve a specific asset.
  | {|+type: 'asset', +name: string|}
  // We attempted to resolve a name as being a source file (ex. JavaScript,
  // JSON...), in which case there can be several extensions we tried, for
  // example `/js/foo.ios.js`, `/js/foo.js`, etc. for a single prefix '/js/foo'.
  | {|
      +type: 'sourceFile',
      +filePathPrefix: string,
      +candidateExts: $ReadOnlyArray<string>,
    |};

export type CustomResolver = (string, string) => string;
