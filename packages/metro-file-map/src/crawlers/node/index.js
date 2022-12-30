/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow strict-local
 * @format
 * @oncall react_native
 */

import type {Path, FileMetaData} from '../../flow-types';
import type {CrawlerOptions, FileData, IgnoreMatcher} from '../../flow-types';

import hasNativeFindSupport from './hasNativeFindSupport';
import H from '../../constants';
import * as fastPath from '../../lib/fast_path';
import {spawn} from 'child_process';
import * as fs from 'graceful-fs';
import * as path from 'path';

const debug = require('debug')('Metro:NodeCrawler');

type Result = Array<
  [/* id */ string, /* mtime */ number, /* size */ number, /* symlink */ 1 | 0],
>;

type Callback = (result: Result) => void;

function find(
  roots: $ReadOnlyArray<string>,
  extensions: $ReadOnlyArray<string>,
  ignore: IgnoreMatcher,
  enableSymlinks: boolean,
  callback: Callback,
): void {
  const result: Result = [];
  let activeCalls = 0;

  function search(directory: string): void {
    activeCalls++;
    fs.readdir(directory, {withFileTypes: true}, (err, entries) => {
      activeCalls--;
      if (err) {
        callback(result);
        return;
      }

      entries.forEach((entry: fs.Dirent) => {
        const file = path.join(directory, entry.name.toString());

        if (ignore(file)) {
          return;
        }

        if (entry.isSymbolicLink() && !enableSymlinks) {
          return;
        }

        if (entry.isDirectory()) {
          search(file);
          return;
        }

        activeCalls++;

        const stat = enableSymlinks ? fs.stat : fs.lstat;

        stat(file, (err, stat) => {
          activeCalls--;

          if (!err && stat) {
            const ext = path.extname(file).substr(1);
            if (extensions.indexOf(ext) !== -1) {
              result.push([
                file,
                stat.mtime.getTime(),
                stat.size,
                entry.isSymbolicLink() ? 1 : 0,
              ]);
            }
          }

          if (activeCalls === 0) {
            callback(result);
          }
        });
      });

      if (activeCalls === 0) {
        callback(result);
      }
    });
  }

  if (roots.length > 0) {
    roots.forEach(search);
  } else {
    callback(result);
  }
}

function findNative(
  roots: $ReadOnlyArray<string>,
  extensions: $ReadOnlyArray<string>,
  ignore: IgnoreMatcher,
  enableSymlinks: boolean,
  callback: Callback,
): void {
  const args = Array.from(roots);
  if (enableSymlinks) {
    // Temporarily(?) disable `enableSymlinks` because we can't satisfy it
    // consistently with recursive crawl without calling *both* stat and lstat
    // on every file. TODO: Change the definition of `enableSymlinks` to return
    // the lstat-equivalent metadata and include links to directories.
    throw new Error('enableSymlinks is not supported by native find');
  } else {
    args.push('-type', 'f');
  }

  if (extensions.length) {
    args.push('(');
  }
  extensions.forEach((ext, index) => {
    if (index) {
      args.push('-o');
    }
    args.push('-iname');
    args.push('*.' + ext);
  });
  if (extensions.length) {
    args.push(')');
  }

  const child = spawn('find', args);
  let stdout = '';
  if (child.stdout == null) {
    throw new Error(
      'stdout is null - this should never happen. Please open up an issue at https://github.com/facebook/metro',
    );
  }
  child.stdout.setEncoding('utf-8');
  child.stdout.on('data', data => (stdout += data));

  child.stdout.on('close', () => {
    const lines = stdout
      .trim()
      .split('\n')
      .filter(x => !ignore(x));
    const result: Result = [];
    let count = lines.length;
    if (!count) {
      callback([]);
    } else {
      lines.forEach(path => {
        fs.stat(path, (err, stat) => {
          // Filter out symlinks that describe directories
          if (!err && stat && !stat.isDirectory()) {
            result.push([path, stat.mtime.getTime(), stat.size, 0]);
          }
          if (--count === 0) {
            callback(result);
          }
        });
      });
    }
  });
}

module.exports = async function nodeCrawl(options: CrawlerOptions): Promise<{
  removedFiles: FileData,
  changedFiles: FileData,
}> {
  const {
    previousState,
    extensions,
    forceNodeFilesystemAPI,
    ignore,
    rootDir,
    enableSymlinks,
    perfLogger,
    roots,
  } = options;
  perfLogger?.point('nodeCrawl_start');
  const useNativeFind =
    !forceNodeFilesystemAPI &&
    !enableSymlinks &&
    (await hasNativeFindSupport());

  debug('Using system find: %s', useNativeFind);

  return new Promise(resolve => {
    const callback = (list: Result) => {
      const changedFiles = new Map<Path, FileMetaData>();
      const removedFiles = new Map(previousState.files);
      for (const fileData of list) {
        const [filePath, mtime, size, symlink] = fileData;
        const relativeFilePath = fastPath.relative(rootDir, filePath);
        const existingFile = previousState.files.get(relativeFilePath);
        removedFiles.delete(relativeFilePath);
        if (existingFile == null || existingFile[H.MTIME] !== mtime) {
          // See ../constants.js; SHA-1 will always be null and fulfilled later.
          changedFiles.set(relativeFilePath, [
            '',
            mtime,
            size,
            0,
            '',
            null,
            symlink,
          ]);
        }
      }

      perfLogger?.point('nodeCrawl_end');
      resolve({
        changedFiles,
        removedFiles,
      });
    };

    if (useNativeFind) {
      findNative(roots, extensions, ignore, enableSymlinks, callback);
    } else {
      find(roots, extensions, ignore, enableSymlinks, callback);
    }
  });
};
