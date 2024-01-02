/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow strict-local
 * @format
 */

import type {RequireContextParams} from '../../ModuleGraph/worker/collectDependencies';
import type {Dependency, TransformResultDependency} from '../types.flow';

import {buildSubgraph} from '../buildSubgraph';
import nullthrows from 'nullthrows';

const makeTransformDep = (
  name: string,
  asyncType: null | 'weak' | 'async' = null,
  contextParams?: RequireContextParams,
): TransformResultDependency => ({
  name,
  data: {key: 'key-' + name, asyncType, locs: [], contextParams},
});

class BadTransformError extends Error {}
class DoesNotExistError extends Error {}

describe('GraphTraversal', () => {
  let transformDeps: Map<string, $ReadOnlyArray<TransformResultDependency>>;

  let params;

  beforeEach(() => {
    transformDeps = new Map([
      ['/bundle', [makeTransformDep('foo')]],
      ['/foo', [makeTransformDep('bar'), makeTransformDep('baz')]],
      ['/bar', []],
      ['/baz', [makeTransformDep('qux', 'weak')]],
      [
        '/entryWithContext',
        [
          makeTransformDep('virtual', null, {
            filter: {
              pattern: 'contextMatch.*',
              flags: 'i',
            },
            mode: 'sync',
            recursive: true,
          }),
        ],
      ],
      [
        '/virtual?ctx=af3bf59b8564d441084c02bdf04c4d662d74d3bd',
        [makeTransformDep('contextMatch')],
      ],
      ['/contextMatch', []],
    ]);
    params = {
      resolve: jest.fn((from, dependency) => {
        if (dependency.name === 'does-not-exist') {
          throw new DoesNotExistError();
        }
        return {
          filePath: `/${dependency.name}`,
          type: 'sourceFile',
        };
      }),
      transform: jest.fn(async (path, requireContext) => {
        if (path === '/bad') {
          throw new BadTransformError();
        }
        return {
          dependencies: nullthrows(transformDeps.get(path), path),
          output: [],
          getSource: () => Buffer.from('// source'),
        };
      }),
      shouldTraverse: jest.fn(
        (dependency: Dependency) => dependency.data.data.asyncType !== 'weak',
      ),
    };
  });

  test('traverses all nodes out from /bundle, except a weak dependency', async () => {
    const {moduleData} = await buildSubgraph(
      new Set(['/bundle']),
      new Map(),
      params,
    );
    expect([...moduleData.keys()]).toEqual(['/bundle', '/foo', '/bar', '/baz']);
    expect(moduleData.get('/bundle')).toEqual({
      dependencies: new Map([
        [
          'key-foo',
          {
            absolutePath: '/foo',
            data: makeTransformDep('foo'),
          },
        ],
      ]),
      getSource: expect.any(Function),
      output: [],
      resolvedContexts: new Map(),
    });
  });

  test('resolves context and traverses context matches', async () => {
    const {moduleData} = await buildSubgraph(
      new Set(['/entryWithContext']),
      new Map(),
      params,
    );
    expect(params.transform).toHaveBeenCalledWith(
      '/entryWithContext',
      undefined,
    );
    const expectedResolvedContext = {
      filter: /contextMatch.*/i,
      from: '/virtual',
      mode: 'sync',
      recursive: true,
    };
    expect(params.transform).toHaveBeenCalledWith(
      '/virtual?ctx=af3bf59b8564d441084c02bdf04c4d662d74d3bd',
      expectedResolvedContext,
    );
    expect(params.transform).toHaveBeenCalledWith('/contextMatch', undefined);
    expect(params.transform).toHaveBeenCalledWith(
      '/entryWithContext',
      undefined,
    );
    expect(moduleData).toEqual(
      new Map([
        [
          '/entryWithContext',
          {
            dependencies: new Map([
              [
                'key-virtual',
                {
                  absolutePath:
                    '/virtual?ctx=af3bf59b8564d441084c02bdf04c4d662d74d3bd',
                  data: nullthrows(transformDeps.get('/entryWithContext'))[0],
                },
              ],
            ]),
            resolvedContexts: new Map([
              ['key-virtual', expectedResolvedContext],
            ]),
            output: [],
            getSource: expect.any(Function),
          },
        ],
        [
          '/contextMatch',
          {
            dependencies: new Map(),
            resolvedContexts: new Map(),
            output: [],
            getSource: expect.any(Function),
          },
        ],
        [
          '/virtual?ctx=af3bf59b8564d441084c02bdf04c4d662d74d3bd',
          {
            dependencies: new Map([
              [
                'key-contextMatch',
                {
                  absolutePath: '/contextMatch',
                  data: nullthrows(
                    transformDeps.get(
                      '/virtual?ctx=af3bf59b8564d441084c02bdf04c4d662d74d3bd',
                    ),
                  )[0],
                },
              ],
            ]),
            resolvedContexts: new Map(),
            output: [],
            getSource: expect.any(Function),
          },
        ],
      ]),
    );
  });

  test('returns errors thrown by the transformer', async () => {
    transformDeps.set('/bar', [makeTransformDep('bad')]);
    const result = await buildSubgraph(new Set(['/bundle']), new Map(), params);
    expect([...result.errors]).toEqual([['/bad', new BadTransformError()]]);
  });

  test('returns errors thrown by the resolver', async () => {
    transformDeps.set('/bar', [makeTransformDep('does-not-exist')]);
    const result = await buildSubgraph(new Set(['/bundle']), new Map(), params);
    expect([...result.errors]).toEqual([['/bar', new DoesNotExistError()]]);
  });
});
