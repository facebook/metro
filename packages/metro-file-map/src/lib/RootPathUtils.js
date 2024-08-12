/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @format
 * @flow strict
 */

import invariant from 'invariant';
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
 * Trailing path separators are preserved, except for fs roots in
 * normalToAbsolute (fs roots always have a trailing separator), and the
 * project root in absoluteToNormal and relativeToNormal (the project root is
 * always the empty string, and is always a directory, so a trailing separator
 * is redundant).
 *
 * As of Node 20, absoluteToNormal is ~8x faster than `path.relative` and
 * `normalToAbsolute` is ~20x faster than `path.resolve`, benchmarked on the
 * real inputs from building FB's product graph. Some well-formed inputs
 * (e.g., /project/./foo/../bar), are handled but not optimised, and we fall
 * back to `node:path` equivalents in those cases.
 */

const UP_FRAGMENT_SEP = '..' + path.sep;
const SEP_UP_FRAGMENT = path.sep + '..';
const UP_FRAGMENT_SEP_LENGTH = UP_FRAGMENT_SEP.length;
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

  getBasenameOfNthAncestor(n: number): string {
    return this.#rootParts[this.#rootParts.length - 1 - n];
  }

  getParts(): $ReadOnlyArray<string> {
    return this.#rootParts;
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
      )?.collapsedPath ?? this.#slowAbsoluteToNormal(absolutePath)
    );
  }

  #slowAbsoluteToNormal(absolutePath: string): string {
    const endsWithSep = absolutePath.endsWith(path.sep);
    const result = path.relative(this.#rootDir, absolutePath);
    return endsWithSep && !result.endsWith(path.sep)
      ? result + path.sep
      : result;
  }

  // `normalPath` is assumed to be normal (root-relative, no redundant
  // indirection), per the definition above.
  normalToAbsolute(normalPath: string): string {
    let left = this.#rootDir;
    let i = 0;
    let pos = 0;
    while (
      normalPath.startsWith(UP_FRAGMENT_SEP, pos) ||
      (normalPath.endsWith('..') && normalPath.length === 2 + pos)
    ) {
      left = this.#rootDirnames[i === this.#rootDepth ? this.#rootDepth : ++i];
      pos += UP_FRAGMENT_SEP_LENGTH;
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
      this.#tryCollapseIndirectionsInSuffix(relativePath, 0, 0)
        ?.collapsedPath ??
      path.relative(this.#rootDir, path.join(this.#rootDir, relativePath))
    );
  }

  // If a path is a direct ancestor of the project root (or the root itself),
  // return a number with the degrees of separation, e.g. root=0, parent=1,..
  // or null otherwise.
  getAncestorOfRootIdx(normalPath: string): ?number {
    if (normalPath === '') {
      return 0;
    }
    if (normalPath === '..') {
      return 1;
    }
    // Otherwise a *normal* path is only a root ancestor if it is a sequence of
    // '../' segments followed by '..', so the length tells us the number of
    // up fragments.
    if (normalPath.endsWith(SEP_UP_FRAGMENT)) {
      return (normalPath.length + 1) / 3;
    }
    return null;
  }

  // Takes a normal and relative path, and joins them efficiently into a normal
  // path, including collapsing trailing '..' in the first part with leading
  // project root segments in the relative part.
  joinNormalToRelative(
    normalPath: string,
    relativePath: string,
  ): {normalPath: string, collapsedSegments: number} {
    if (normalPath === '') {
      return {collapsedSegments: 0, normalPath: relativePath};
    }
    if (relativePath === '') {
      return {collapsedSegments: 0, normalPath};
    }
    const left = normalPath + path.sep;
    const rawPath = left + relativePath;
    if (normalPath === '..' || normalPath.endsWith(SEP_UP_FRAGMENT)) {
      const collapsed = this.#tryCollapseIndirectionsInSuffix(rawPath, 0, 0);
      invariant(collapsed != null, 'Failed to collapse');
      return {
        collapsedSegments: collapsed.collapsedSegments,
        normalPath: collapsed.collapsedPath,
      };
    }
    return {
      collapsedSegments: 0,
      normalPath: rawPath,
    };
  }

  relative(from: string, to: string): string {
    return path.relative(from, to);
  }

  // Internal: Tries to collapse sequences like `../root/foo` for root
  // `/project/root` down to the normal 'foo'.
  #tryCollapseIndirectionsInSuffix(
    fullPath: string, // A string ending with the relative path to process
    startOfRelativePart: number, // Index of the start of part to process
    implicitUpIndirections: number, // 0=root-relative, 1=dirname(root)-relative...
  ): ?{collapsedPath: string, collapsedSegments: number} {
    let totalUpIndirections = implicitUpIndirections;
    let collapsedSegments = 0;
    // Allow any sequence of indirection fragments at the start of the
    // unmatched suffix e.g /project/[../../foo], but bail out to Node's
    // path.relative if we find a possible indirection after any later segment,
    // or on any "./" that isn't a "../".
    for (let pos = startOfRelativePart; ; pos += UP_FRAGMENT_SEP_LENGTH) {
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
            collapsedSegments++;
            totalUpIndirections--;
          } else {
            break;
          }
        }
        // After collapsing we may have no more segments remaining (following
        // '..' indirections). Ensure that we don't drop or add a trailing
        // separator in this case by taking .slice(pos-1). In any other case,
        // we know that fullPath[pos] is a separator.
        if (pos >= fullPath.length) {
          return {
            collapsedPath:
              totalUpIndirections > 0
                ? UP_FRAGMENT_SEP.repeat(totalUpIndirections - 1) +
                  '..' +
                  fullPath.slice(pos - 1)
                : '',
            collapsedSegments,
          };
        }
        const right = pos > 0 ? fullPath.slice(pos) : fullPath;
        if (
          right === '..' &&
          totalUpIndirections >= this.#rootParts.length - 1
        ) {
          // If we have no right side (or an indirection that would take us
          // below the root), just ensure we don't include a trailing separtor.
          return {
            collapsedPath: UP_FRAGMENT_SEP.repeat(totalUpIndirections).slice(
              0,
              -1,
            ),
            collapsedSegments,
          };
        }
        // Optimisation for the common case, saves a concatenation.
        if (totalUpIndirections === 0) {
          return {collapsedPath: right, collapsedSegments};
        }
        return {
          collapsedPath: UP_FRAGMENT_SEP.repeat(totalUpIndirections) + right,
          collapsedSegments,
        };
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
