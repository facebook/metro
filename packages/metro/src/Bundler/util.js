/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow
 * @format
 * @oncall react_native
 */

'use strict';

import type {AssetDataFiltered, AssetDataWithoutFiles} from '../Assets';
import type {ModuleTransportLike} from '../shared/types.flow';
import type {File} from '@babel/types';

const babylon = require('@babel/parser');
const template = require('@babel/template').default;
const babelTypes = require('@babel/types');

type SubTree<T: ModuleTransportLike> = (
  moduleTransport: T,
  moduleTransportsByPath: Map<string, T>,
) => Iterable<number>;

const assetPropertyBlockList = new Set(['files', 'fileSystemLocation', 'path']);

function generateAssetCodeFileAst(
  assetRegistryPath: string,
  assetDescriptor: AssetDataWithoutFiles,
): File {
  const properDescriptor = filterObject(
    assetDescriptor,
    assetPropertyBlockList,
  );

  // {...}
  const descriptorAst = babylon.parseExpression(
    JSON.stringify(properDescriptor),
  );
  const t = babelTypes;

  // require('AssetRegistry').registerAsset({...})
  const buildRequire = template.statement(`
    module.exports = require(ASSET_REGISTRY_PATH).registerAsset(DESCRIPTOR_AST)
  `);

  return t.file(
    t.program([
      buildRequire({
        ASSET_REGISTRY_PATH: t.stringLiteral(assetRegistryPath),
        DESCRIPTOR_AST: descriptorAst,
      }),
    ]),
  );
}

function filterObject(
  object: AssetDataWithoutFiles,
  blockList: Set<string>,
): AssetDataFiltered {
  const copied = {...object};
  for (const key of blockList) {
    // $FlowFixMe[prop-missing]
    delete copied[key];
  }
  return copied;
}

function createRamBundleGroups<T: ModuleTransportLike>(
  ramGroups: $ReadOnlyArray<string>,
  groupableModules: $ReadOnlyArray<T>,
  subtree: SubTree<T>,
): Map<number, Set<number>> {
  // build two maps that allow to lookup module data
  // by path or (numeric) module id;
  const byPath: Map<string, T> = new Map();
  const byId: Map<number, string> = new Map();
  groupableModules.forEach((m: T) => {
    byPath.set(m.sourcePath, m);
    byId.set(m.id, m.sourcePath);
  });

  // build a map of group root IDs to an array of module IDs in the group
  const result: Map<number, Set<number>> = new Map(
    ramGroups.map((modulePath: string) => {
      const root = byPath.get(modulePath);
      if (root == null) {
        throw Error(`Group root ${modulePath} is not part of the bundle`);
      }
      return [
        root.id,
        // `subtree` yields the IDs of all transitive dependencies of a module
        new Set(subtree(root, byPath)),
      ];
    }),
  );

  if (ramGroups.length > 1) {
    // build a map of all grouped module IDs to an array of group root IDs
    const all = new ArrayMap<number, number>();
    for (const [parent, children] of result) {
      for (const module of children) {
        all.get(module).push(parent);
      }
    }

    // find all module IDs that are part of more than one group
    const doubles = filter(all, ([, parents]) => parents.length > 1);
    for (const [moduleId, parents] of doubles) {
      // $FlowFixMe[method-unbinding] added when improving typing for this parameters
      const parentNames = parents.map(byId.get, byId);
      const lastName = parentNames.pop();
      throw new Error(
        `Module ${
          byId.get(moduleId) || moduleId
        } belongs to groups ${parentNames.join(', ')}, and ${String(
          lastName,
        )}. Ensure that each module is only part of one group.`,
      );
    }
  }

  return result;
}

function* filter<A: number, B: number>(
  iterator: ArrayMap<A, B>,
  predicate: ([A, Array<B>]) => boolean,
): Generator<[A, Array<B>], void, void> {
  for (const value of iterator) {
    if (predicate(value)) {
      yield value;
    }
  }
}

class ArrayMap<K, V> extends Map<K, Array<V>> {
  get(key: K): Array<V> {
    let array = super.get(key);
    if (!array) {
      array = [];
      this.set(key, array);
    }
    return array;
  }
}

module.exports = {
  createRamBundleGroups,
  generateAssetCodeFileAst,
};
