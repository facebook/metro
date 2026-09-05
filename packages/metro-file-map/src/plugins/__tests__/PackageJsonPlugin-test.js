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

import type {CanonicalPath, FileMetadata} from '../../flow-types';
import type TreeFSType from '../../lib/TreeFS';
import type PackageJsonPluginType from '../PackageJsonPlugin';

let mockPathModule;
jest.mock('node:path', () => mockPathModule);

describe.each([['win32'], ['posix']])('PackageJsonPlugin on %s', platform => {
  // Convenience function to write paths with posix separators but convert them
  // to system separators
  const p: string => string = filePath =>
    platform === 'win32'
      ? filePath.replace(/\//g, '\\').replace(/^\\/, 'C:\\')
      : filePath;

  const file = (): FileMetadata => [1, 0, 0, null, 0, null];
  const link = (target: string): FileMetadata => [
    1,
    0,
    0,
    null,
    p(target),
    null,
  ];

  const regularFiles = [
    'package.json',
    'src/index.js',
    'src/lib/util.js',
    'src/node_modules/local/package.json',
    'src/node_modules/local/index.js',
    'node_modules/pkg/package.json',
    'node_modules/pkg/lib/a.js',
    'node_modules/pkg/node_modules/nested/package.json',
    'node_modules/pkg/node_modules/nested/index.js',
    'node_modules/@scope/pkg/package.json',
    'node_modules/@scope/pkg/index.js',
    'node_modules/nopkg/index.js',
    'node_modules/nopkg/deep/x.js',
    'apps/x/node_modules/package.json',
    'apps/x/node_modules/y.js',
    'packages/manifest-link/index.js',
    'packages/dangling/index.js',
    'packages/dir-manifest/index.js',
    '../outside/lib/x.js',
    '../outside/pkg/package.json',
    '../outside/pkg/index.js',
  ];

  const symlinks: Array<[string, string]> = [
    ['link-to-pkg', 'node_modules/pkg'],
    ['node_modules/linked', '../../outside/pkg'],
    ['link-to-outside-lib', '../outside/lib'],
    [
      'packages/manifest-link/package.json',
      '../../node_modules/pkg/package.json',
    ],
    ['packages/dangling/package.json', './nowhere'],
    ['packages/dir-manifest/package.json', '../../src'],
  ];

  let tfs: TreeFSType;
  let plugin: PackageJsonPluginType;

  const scopeOf = (mixedPath: string) => plugin.getPackageScopeOf(p(mixedPath));

  const expectedScope = (
    rootPath: string,
    packageRelativePath: string,
    packageJsonPath: string = rootPath + '/package.json',
  ) => ({
    packageJsonPath: p(packageJsonPath),
    rootPath: p(rootPath),
    packageRelativePath: p(packageRelativePath),
  });

  async function initializePlugin() {
    plugin = new (require('../PackageJsonPlugin').default)({
      rootDir: p('/project'),
    });
    await plugin.initialize({
      files: {
        lookup: mixedPath => {
          const result = tfs.lookup(mixedPath);
          if (!result.exists) {
            return {exists: false, missing: result.missing};
          }
          if (result.type === 'd') {
            return {exists: true, type: 'd', realPath: result.realPath};
          }
          return {
            exists: true,
            type: 'f',
            realPath: result.realPath,
            pluginData: undefined,
          };
        },
        fileIterator: opts =>
          (function* () {
            for (const {baseName, canonicalPath} of tfs.metadataIterator(
              opts,
            )) {
              yield {baseName, canonicalPath, pluginData: undefined};
            }
          })(),
      },
      pluginState: null,
    });
  }

  beforeEach(async () => {
    jest.resetModules();
    mockPathModule = jest.requireActual<{}>('path')[platform];
    const TreeFS = require('../../lib/TreeFS').default;
    tfs = new TreeFS({
      rootDir: p('/project'),
      files: new Map<CanonicalPath, FileMetadata>([
        ...regularFiles.map(f => [p(f), file()]),
        ...symlinks.map(([f, target]) => [p(f), link(target)]),
      ]),
      processFile: () => {
        throw new Error('Not implemented');
      },
    });
    await initializePlugin();
  });

  describe('getPackageScopeOf', () => {
    test.each([
      ['/project/src/index.js', expectedScope('/project', 'src/index.js')],
      [
        '/project/src/lib/util.js',
        expectedScope('/project', 'src/lib/util.js'),
      ],
      ['/project/package.json', expectedScope('/project', 'package.json')],
      ['/project', expectedScope('/project', '')],
      ['/project/src', expectedScope('/project', 'src')],
      ['/project/src/', expectedScope('/project', 'src')],
      // A directory named node_modules with no manifest is not its own scope
      // boundary
      ['/project/node_modules', expectedScope('/project', 'node_modules')],
      // ...but its children are outside every scope unless they have their
      // own manifest
      ['/project/node_modules/nopkg', null],
      ['/project/node_modules/nopkg/index.js', null],
      ['/project/node_modules/nopkg/deep/x.js', null],
      [
        '/project/node_modules/pkg/lib/a.js',
        expectedScope('/project/node_modules/pkg', 'lib/a.js'),
      ],
      [
        '/project/node_modules/pkg',
        expectedScope('/project/node_modules/pkg', ''),
      ],
      [
        '/project/node_modules/@scope/pkg/index.js',
        expectedScope('/project/node_modules/@scope/pkg', 'index.js'),
      ],
      ['/project/node_modules/@scope', null],
      [
        '/project/node_modules/pkg/node_modules/nested/index.js',
        expectedScope(
          '/project/node_modules/pkg/node_modules/nested',
          'index.js',
        ),
      ],
      [
        '/project/node_modules/pkg/node_modules',
        expectedScope('/project/node_modules/pkg', 'node_modules'),
      ],
      ['/project/node_modules/pkg/node_modules/missing/index.js', null],
      [
        '/project/src/node_modules/local/index.js',
        expectedScope('/project/src/node_modules/local', 'index.js'),
      ],
      ['/project/src/node_modules/missing.js', null],
      // A directory named node_modules is its own first candidate
      [
        '/project/apps/x/node_modules',
        expectedScope('/project/apps/x/node_modules', ''),
      ],
      ['/project/apps/x/node_modules/y.js', null],
      // Missing paths take the scope of their deepest existing ancestor
      ['/project/src/missing.js', expectedScope('/project', 'src/missing.js')],
      [
        '/project/src/missing/deep/file.js',
        expectedScope('/project', 'src/missing/deep/file.js'),
      ],
      [
        '/project/src/missing/node_modules/x.js',
        expectedScope('/project', 'src/missing/node_modules/x.js'),
      ],
      // ...unless the first missing segment is node_modules
      ['/project/src/lib/node_modules/x.js', null],
      ['/project/src/lib/node_modules', null],
      // Missing paths with the same segment name at more than one depth
      [
        '/project/src/src/lib/src.js',
        expectedScope('/project', 'src/src/lib/src.js'),
      ],
      // Non-normal inputs
      [
        '/project/src/./missing.js',
        expectedScope('/project', 'src/missing.js'),
      ],
      [
        '/project/src/lib/../missing.js',
        expectedScope('/project', 'src/missing.js'),
      ],
      [
        '/project/src/../src/index.js',
        expectedScope('/project', 'src/index.js'),
      ],
      // Root-relative inputs
      ['src/index.js', expectedScope('/project', 'src/index.js')],
      ['src/missing.js', expectedScope('/project', 'src/missing.js')],
      ['', expectedScope('/project', '')],
      ['../outside/pkg/index.js', expectedScope('/outside/pkg', 'index.js')],
      // Outside the project root
      ['/outside/pkg/index.js', expectedScope('/outside/pkg', 'index.js')],
      ['/outside/pkg/missing.js', expectedScope('/outside/pkg', 'missing.js')],
      ['/outside/lib/x.js', null],
      ['/outside', null],
      ['/nowhere/at/all.js', null],
      ['/', null],
    ])('%s', (mixedPath, expected) => {
      expect(scopeOf(mixedPath)).toEqual(expected);
    });

    test('queries are memoized per directory across a query set', () => {
      const first = scopeOf('/project/src/lib/util.js');
      expect(scopeOf('/project/src/lib/missing.js')).toEqual(
        expectedScope('/project', 'src/lib/missing.js'),
      );
      expect(scopeOf('/project/src/lib/util.js')).toEqual(first);
      expect(scopeOf('/project/src/index.js')).toEqual(
        expectedScope('/project', 'src/index.js'),
      );
    });
  });

  describe('symlinks', () => {
    test.each([
      // A path through a symlinked directory takes the scope of the target.
      [
        '/project/link-to-pkg/lib/a.js',
        expectedScope('/project/node_modules/pkg', 'lib/a.js'),
      ],
      ['/project/link-to-pkg', expectedScope('/project/node_modules/pkg', '')],
      [
        '/project/link-to-pkg/lib/missing.js',
        expectedScope('/project/node_modules/pkg', 'lib/missing.js'),
      ],
      [
        '/project/link-to-pkg/missing/deep.js',
        expectedScope('/project/node_modules/pkg', 'missing/deep.js'),
      ],
      ['/project/link-to-pkg/node_modules/missing.js', null],
      // Workspace-style links from node_modules to a package outside the
      // project root.
      [
        '/project/node_modules/linked/index.js',
        expectedScope('/outside/pkg', 'index.js'),
      ],
      [
        '/project/node_modules/linked/missing.js',
        expectedScope('/outside/pkg', 'missing.js'),
      ],
      // The target's real ancestors are what matter, not the link's. The
      // target here has no package, so nor does a path through the link,
      // whereas `hierarchicalLookup` continues through the link's lexical
      // parent to the project's package.json.
      ['/project/link-to-outside-lib/x.js', null],
      ['/project/link-to-outside-lib/missing.js', null],
      // A symlinked package.json is the package's manifest, and the scope
      // root is the link's directory. `hierarchicalLookup` reports the
      // target's real path instead.
      [
        '/project/packages/manifest-link/index.js',
        expectedScope('/project/packages/manifest-link', 'index.js'),
      ],
      // A dangling symlink named package.json is no manifest
      [
        '/project/packages/dangling/index.js',
        expectedScope('/project', 'packages/dangling/index.js'),
      ],
      // Nor is a symlink to a directory
      [
        '/project/packages/dir-manifest/index.js',
        expectedScope('/project', 'packages/dir-manifest/index.js'),
      ],
    ])('%s', (mixedPath, expected) => {
      expect(scopeOf(mixedPath)).toEqual(expected);
    });
  });

  describe('parity with hierarchicalLookup for paths without symlinks', () => {
    // Every regular file and directory, root-relative and absolute, plus
    // missing paths under every directory. Excludes the package whose
    // manifest is a symlink, which the two report differently by design.
    const inputs = new Set<string>();
    for (const regularFile of regularFiles) {
      if (regularFile.startsWith('packages/manifest-link/')) {
        continue;
      }
      let dir = regularFile;
      inputs.add(dir);
      while (dir.includes('/')) {
        dir = dir.slice(0, dir.lastIndexOf('/'));
        inputs.add(dir);
        inputs.add(dir + '/missing.js');
        inputs.add(dir + '/missing/deep.js');
        inputs.add(dir + '/node_modules');
        inputs.add(dir + '/node_modules/missing/index.js');
      }
    }
    const cases = [...inputs].flatMap(input => [
      input,
      input.startsWith('..') ? input.slice(2) : '/project/' + input,
    ]);

    test.each(cases)('%s', input => {
      const expected = tfs.hierarchicalLookup(p(input), 'package.json', {
        breakOnSegment: 'node_modules',
        invalidatedBy: null,
        subpathType: 'f',
      });
      const scope = scopeOf(input);
      expect(
        scope == null
          ? null
          : {
              absolutePath: scope.packageJsonPath,
              containerRelativePath: scope.packageRelativePath,
            },
      ).toEqual(expected);
      if (scope != null) {
        expect(scope.rootPath).toEqual(
          mockPathModule.dirname(scope.packageJsonPath),
        );
      }
    });
  });

  describe('onChanged', () => {
    const noChanges = {
      addedDirectories: new Set<string>(),
      removedDirectories: new Set<string>(),
      addedFiles: new Map<string, void>(),
      modifiedFiles: new Map<string, void>(),
      removedFiles: new Map<string, void>(),
    };

    test('adding a package.json rescopes its subtree', () => {
      expect(scopeOf('/project/src/lib/util.js')).toEqual(
        expectedScope('/project', 'src/lib/util.js'),
      );
      tfs.addOrModify(p('src/package.json'), file());
      plugin.onChanged({
        ...noChanges,
        addedFiles: new Map([[p('src/package.json'), undefined]]),
      });
      expect(scopeOf('/project/src/lib/util.js')).toEqual(
        expectedScope('/project/src', 'lib/util.js'),
      );
      expect(scopeOf('/project/src/index.js')).toEqual(
        expectedScope('/project/src', 'index.js'),
      );
      expect(scopeOf('/project/package.json')).toEqual(
        expectedScope('/project', 'package.json'),
      );
    });

    test('removing a package.json rescopes its subtree', () => {
      expect(scopeOf('/project/node_modules/pkg/lib/a.js')).toEqual(
        expectedScope('/project/node_modules/pkg', 'lib/a.js'),
      );
      tfs.remove(p('node_modules/pkg/package.json'));
      plugin.onChanged({
        ...noChanges,
        removedFiles: new Map([
          [p('node_modules/pkg/package.json'), undefined],
        ]),
      });
      expect(scopeOf('/project/node_modules/pkg/lib/a.js')).toBeNull();
      expect(scopeOf('/project/node_modules/pkg')).toBeNull();
    });

    test('adding a package.json directly under node_modules', () => {
      expect(scopeOf('/project/node_modules/nopkg/deep/x.js')).toBeNull();
      tfs.addOrModify(p('node_modules/nopkg/package.json'), file());
      plugin.onChanged({
        ...noChanges,
        addedFiles: new Map([
          [p('node_modules/nopkg/package.json'), undefined],
        ]),
      });
      expect(scopeOf('/project/node_modules/nopkg/deep/x.js')).toEqual(
        expectedScope('/project/node_modules/nopkg', 'deep/x.js'),
      );
    });

    test('modifying a package.json does not change scopes', () => {
      const before = scopeOf('/project/src/index.js');
      tfs.addOrModify(p('package.json'), [2, 10, 0, null, 0, null]);
      plugin.onChanged({
        ...noChanges,
        modifiedFiles: new Map([[p('package.json'), undefined]]),
      });
      expect(scopeOf('/project/src/index.js')).toEqual(before);
    });

    test('changes to other files do not change scopes', () => {
      const before = scopeOf('/project/src/index.js');
      tfs.addOrModify(p('src/lib/new.js'), file());
      tfs.remove(p('src/lib/util.js'));
      plugin.onChanged({
        ...noChanges,
        addedFiles: new Map([[p('src/lib/new.js'), undefined]]),
        removedFiles: new Map([[p('src/lib/util.js'), undefined]]),
      });
      expect(scopeOf('/project/src/index.js')).toEqual(before);
      expect(scopeOf('/project/src/lib/new.js')).toEqual(
        expectedScope('/project', 'src/lib/new.js'),
      );
    });

    test('a symlinked package.json counts once it points at a file', () => {
      expect(scopeOf('/project/packages/dangling/index.js')).toEqual(
        expectedScope('/project', 'packages/dangling/index.js'),
      );
      tfs.addOrModify(p('packages/dangling/nowhere'), file());
      plugin.onChanged({
        ...noChanges,
        addedFiles: new Map([[p('packages/dangling/nowhere'), undefined]]),
      });
      // The link's target is not itself a manifest, so nothing changes until
      // the link is reported as modified.
      expect(scopeOf('/project/packages/dangling/index.js')).toEqual(
        expectedScope('/project', 'packages/dangling/index.js'),
      );
      plugin.onChanged({
        ...noChanges,
        modifiedFiles: new Map([
          [p('packages/dangling/package.json'), undefined],
        ]),
      });
      expect(scopeOf('/project/packages/dangling/index.js')).toEqual(
        expectedScope('/project/packages/dangling', 'index.js'),
      );
    });

    test('a symlinked package.json stops counting once it dangles', () => {
      expect(scopeOf('/project/packages/manifest-link/index.js')).toEqual(
        expectedScope('/project/packages/manifest-link', 'index.js'),
      );
      tfs.addOrModify(
        p('packages/manifest-link/package.json'),
        link('./nowhere'),
      );
      plugin.onChanged({
        ...noChanges,
        modifiedFiles: new Map([
          [p('packages/manifest-link/package.json'), undefined],
        ]),
      });
      expect(scopeOf('/project/packages/manifest-link/index.js')).toEqual(
        expectedScope('/project', 'packages/manifest-link/index.js'),
      );
    });

    test('removing the target of a symlinked package.json', () => {
      tfs.remove(p('node_modules/pkg/package.json'));
      plugin.onChanged({
        ...noChanges,
        removedFiles: new Map([
          [p('node_modules/pkg/package.json'), undefined],
        ]),
      });
      // The link itself is unchanged, so its index entry is stale until the
      // watcher reports the link. This mirrors the file map, which also does
      // not report links to a removed target as changed.
      expect(scopeOf('/project/packages/manifest-link/index.js')).toEqual(
        expectedScope('/project/packages/manifest-link', 'index.js'),
      );
    });
  });
});
