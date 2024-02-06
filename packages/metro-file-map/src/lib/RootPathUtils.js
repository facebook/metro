/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @format
 * @flow strict
 */

import * as path from 'path';

/**
 * This module provides path utility functions - similar to `node:path` -
 * optimised for Metro's use case (many paths, few roots) under assumptions
 * typically safe to make within Metro - namely:
 *
 *  - All input path separators must be system-native.
 *  - Double/redundant separators like '/foo//bar' are not supported.
 *  - All characters except separators are assumed to be valid in path segments.
 *
 *  - A "well-formed" path is any path following the rules above.
 *  - A "normal" path is a root-relative well-formed path with no redundant
 *    indirections. Normal paths have no leading './`, and the normal path of
 *    the root is the empty string.
 *
 * Output and input paths are at least well-formed (normal where indicated by
 * naming).
 *
 * As of Node 20, absoluteToNormal is ~8x faster than `path.relative` and
 * `normalToAbsolute` is ~20x faster than `path.resolve`, benchmarked on the
 * real inputs from building FB's product graph. Some well-formed inputs
 * (e.g., /project/./foo/../bar), are handled but not optimised, and we fall
 * back to `node:path` equivalents in those cases.
 */

const UP_FRAGMENT = '..' + path.sep;
const UP_FRAGMENT_LENGTH = UP_FRAGMENT.length;
const CURRENT_FRAGMENT = '.' + path.sep;

export class RootPathUtils {
  #rootDir: string;
  #rootDirnames: $ReadOnlyArray<string>;
  #rootParts: $ReadOnlyArray<string>;
  #rootDepth: number;

  constructor(rootDir: string) {
    this.#rootDir = rootDir;
    const rootDirnames = [];
    for (
      let next = rootDir, previous = null;
      previous !== next;
      previous = next, next = path.dirname(next)
    ) {
      rootDirnames.push(next);
    }
    this.#rootDirnames = rootDirnames;

    this.#rootParts = rootDir.split(path.sep);
    this.#rootDepth = rootDirnames.length - 1;

    // If rootDir is a filesystem root (C:\ or /), it will end in a separator and
    // give a spurious empty entry at the end of rootParts.
    if (this.#rootDepth === 0) {
      this.#rootParts.pop();
    }
  }

  // absolutePath may be any well-formed absolute path.
  absoluteToNormal(absolutePath: string): string {
    let endOfMatchingPrefix = 0;
    let lastMatchingPartIdx = 0;

    for (
      let nextPart = this.#rootParts[0], nextLength = nextPart.length;
      nextPart != null &&
      // Check that absolutePath is equal to nextPart + '/' or ends with
      // nextPart, starting from endOfMatchingPrefix.
      absolutePath.startsWith(nextPart, endOfMatchingPrefix) &&
      (absolutePath.length === endOfMatchingPrefix + nextLength ||
        absolutePath[endOfMatchingPrefix + nextLength] === path.sep);

    ) {
      // Move our matching pointer forward and load the next part.
      endOfMatchingPrefix += nextLength + 1;
      nextPart = this.#rootParts[++lastMatchingPartIdx];
      nextLength = nextPart?.length;
    }

    // If our root is /project/root and we're given /project/bar/foo.js, we
    // have matched up to '/project', and will need to return a path
    // beginning '../' (one prepended indirection, to go up from 'root').
    //
    // If we're given /project/../project2/otherroot, we have one level of
    // indirection up to prepend in the same way as above. There's another
    // explicit indirection already present in the input - we'll account for
    // that in tryCollapseIndirectionsInSuffix.
    const upIndirectionsToPrepend =
      this.#rootParts.length - lastMatchingPartIdx;

    return (
      this.#tryCollapseIndirectionsInSuffix(
        absolutePath,
        endOfMatchingPrefix,
        upIndirectionsToPrepend,
      ) ?? path.relative(this.#rootDir, absolutePath)
    );
  }

  // `normalPath` is assumed to be normal (root-relative, no redundant
  // indirection), per the definition above.
  normalToAbsolute(normalPath: string): string {
    let left = this.#rootDir;
    let i = 0;
    let pos = 0;
    while (
      normalPath.startsWith(UP_FRAGMENT, pos) ||
      (normalPath.endsWith('..') && normalPath.length === 2 + pos)
    ) {
      left = this.#rootDirnames[i === this.#rootDepth ? this.#rootDepth : ++i];
      pos += UP_FRAGMENT_LENGTH;
    }
    const right = pos === 0 ? normalPath : normalPath.slice(pos);
    if (right.length === 0) {
      return left;
    }
    // left may already end in a path separator only if it is a filesystem root,
    // '/' or 'X:\'.
    if (i === this.#rootDepth) {
      return left + right;
    }
    return left + path.sep + right;
  }

  relativeToNormal(relativePath: string): string {
    return (
      this.#tryCollapseIndirectionsInSuffix(relativePath, 0, 0) ??
      path.relative(this.#rootDir, path.join(this.#rootDir, relativePath))
    );
  }

  // Internal: Tries to collapse sequences like `../root/foo` for root
  // `/project/root` down to the normal 'foo'.
  #tryCollapseIndirectionsInSuffix(
    fullPath: string, // A string ending with the relative path to process
    startOfRelativePart: number, // Index of the start of part to process
    implicitUpIndirections: number, // 0=root-relative, 1=dirname(root)-relative...
  ): ?string {
    let totalUpIndirections = implicitUpIndirections;
    // Allow any sequence of indirection fragments at the start of the
    // unmatched suffix e.g /project/[../../foo], but bail out to Node's
    // path.relative if we find a possible indirection after any later segment,
    // or on any "./" that isn't a "../".
    for (let pos = startOfRelativePart; ; pos += UP_FRAGMENT_LENGTH) {
      const nextIndirection = fullPath.indexOf(CURRENT_FRAGMENT, pos);
      if (nextIndirection === -1) {
        // If we have any indirections, they may "collapse" if a subsequent
        // segment re-enters a directory we had previously exited, e.g:
        // /project/root/../root/foo should collapse to /project/root/foo' and
        // return foo, not ../root/foo.
        //
        // We match each segment following redirections, in turn, against the
        // part of the root path they may collapse into, and break on the first
        // mismatch.
        while (totalUpIndirections > 0) {
          const segmentToMaybeCollapse =
            this.#rootParts[this.#rootParts.length - totalUpIndirections];
          if (
            fullPath.startsWith(segmentToMaybeCollapse, pos) &&
            // The following character should be either a separator or end of
            // string
            (fullPath.length === segmentToMaybeCollapse.length + pos ||
              fullPath[segmentToMaybeCollapse.length + pos] === path.sep)
          ) {
            pos += segmentToMaybeCollapse.length + 1;
            totalUpIndirections--;
          } else {
            break;
          }
        }
        const right = fullPath.slice(pos);
        if (
          right === '' ||
          (right === '..' && totalUpIndirections >= this.#rootParts.length - 1)
        ) {
          // If we have no right side (or an indirection that would take us
          // below the root), just ensure we don't include a trailing separtor.
          return UP_FRAGMENT.repeat(totalUpIndirections).slice(0, -1);
        }
        // Optimisation for the common case, saves a concatenation.
        if (totalUpIndirections === 0) {
          return right;
        }
        return UP_FRAGMENT.repeat(totalUpIndirections) + right;
      }

      // Cap the number of indirections at the total number of root segments.
      // File systems treat '..' at the root as '.'.
      if (totalUpIndirections < this.#rootParts.length - 1) {
        totalUpIndirections++;
      }

      if (
        nextIndirection !== pos + 1 || // Fallback when ./ later in the path, or leading
        fullPath[pos] !== '.' // and for anything other than a leading ../
      ) {
        return null;
      }
    }
  }
}
