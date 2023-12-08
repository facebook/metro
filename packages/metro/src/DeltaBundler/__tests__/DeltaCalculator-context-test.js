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

'use strict';

import type {Result} from '../Graph';
import type {Options, TransformResultDependency} from '../types.flow';

import CountingSet from '../../lib/CountingSet';
import {Graph} from '../Graph';

const DeltaCalculator = require('../DeltaCalculator');
const {EventEmitter} = require('events');

const traverseDependencies = jest.spyOn(
  Graph.prototype,
  'traverseDependencies',
);
const initialTraverseDependencies = jest.spyOn(
  Graph.prototype,
  'initialTraverseDependencies',
);
const markModifiedContextModules = jest.spyOn(
  Graph.prototype,
  'markModifiedContextModules',
);

describe('DeltaCalculator + require.context', () => {
  let deltaCalculator;
  let fileWatcher;

  const options = {
    unstable_allowRequireContext: true,
    unstable_enablePackageExports: false,
    lazy: false,
    onProgress: null,
    resolve: (from: string, to: TransformResultDependency) => {
      throw new Error('Never called');
    },
    shallow: false,
    transform: (modulePath: string) => {
      throw new Error('Never called');
    },
    transformOptions: {
      // NOTE: These options are ignored because we mock out the transformer (via traverseDependencies).
      dev: false,
      hot: false,
      minify: false,
      platform: null,
      type: 'module',
      unstable_transformProfile: 'default',
    },
  };

  beforeEach(async () => {
    fileWatcher = new EventEmitter();

    markModifiedContextModules.mockImplementation(function <T>(
      this: Graph<T>,
      filePath,
      modifiedContexts,
    ) {
      if (filePath.startsWith('/ctx/')) {
        modifiedContexts.add('/ctx?ctx=xxx');
      }
    });

    /*
      ┌─────────┐  require.context('./ctx', ...)   ┌──────────────┐     ┌──────────┐
      │ /bundle │ ───────────────────────────────▶ │ /ctx?ctx=xxx │ ──▶ │ /ctx/foo │
      └─────────┘                                  └──────────────┘     └──────────┘
     */

    initialTraverseDependencies.mockImplementationOnce(async function <T>(
      this: Graph<T>,
      options: Options<T>,
    ): Promise<Result<T>> {
      this.dependencies.set('/bundle', {
        dependencies: new Map([
          [
            'ctx',
            {
              absolutePath: '/ctx?ctx=xxx',
              data: {
                name: 'ctx',
                data: {key: 'ctx?ctx=xxx', asyncType: null, locs: []},
              },
            },
          ],
        ]),
        inverseDependencies: new CountingSet([]),
        output: [],
        path: '/bundle',
        getSource: () => Buffer.of(),
      });
      this.dependencies.set('/ctx?ctx=xxx', {
        dependencies: new Map([
          [
            'foo',
            {
              absolutePath: '/ctx/foo',
              data: {
                name: 'foo',
                data: {key: 'foo', asyncType: null, locs: []},
              },
            },
          ],
        ]),
        inverseDependencies: new CountingSet(['/bundle']),
        output: [],
        path: '/ctx?ctx=xxx',
        getSource: () => Buffer.of(),
      });
      this.dependencies.set('/ctx/foo', {
        dependencies: new Map(),
        inverseDependencies: new CountingSet(['/ctx?ctx=xxx']),
        output: [],
        path: '/ctx/foo',
        getSource: () => Buffer.of(),
      });

      return {
        added: new Map(this.dependencies),
        modified: new Map(),
        deleted: new Set(),
      };
    });

    // We don't assert on the actual deltas, so use an empty mock.
    traverseDependencies.mockReturnValue(
      Promise.resolve({
        added: new Map(),
        modified: new Map(),
        deleted: new Set(),
      }),
    );

    // $FlowFixMe[underconstrained-implicit-instantiation]
    deltaCalculator = new DeltaCalculator(
      new Set(['/bundle']),
      fileWatcher,
      options,
    );
  });

  afterEach(() => {
    deltaCalculator.end();

    traverseDependencies.mockReset();
    initialTraverseDependencies.mockReset();
  });

  test('removing a file from a context marks the context as modified', async () => {
    // Initial build
    await deltaCalculator.getDelta({reset: false, shallow: false});

    fileWatcher.emit('change', {
      eventsQueue: [
        {type: 'delete', filePath: '/ctx/foo', metadata: {type: 'f'}},
      ],
    });

    // Incremental build
    await deltaCalculator.getDelta({
      reset: false,
      shallow: false,
    });

    expect(traverseDependencies).toBeCalledWith(
      ['/ctx?ctx=xxx'],
      expect.anything(),
    );

    // We rely on inverse dependencies to update a context module.
    expect(markModifiedContextModules).not.toBeCalled();

    expect(traverseDependencies).toBeCalledTimes(1);
  });

  test('adding a file to a context marks the context as modified', async () => {
    // Initial build
    await deltaCalculator.getDelta({reset: false, shallow: false});

    fileWatcher.emit('change', {
      eventsQueue: [
        {type: 'add', filePath: '/ctx/foo2', metadata: {type: 'f'}},
      ],
    });

    // Incremental build
    await deltaCalculator.getDelta({
      reset: false,
      shallow: false,
    });

    expect(traverseDependencies).toBeCalledWith(
      ['/ctx?ctx=xxx'],
      expect.anything(),
    );

    expect(traverseDependencies).toBeCalledTimes(1);
  });

  test('modifying an existing file in a context does not mark the context as modified', async () => {
    // Initial build
    await deltaCalculator.getDelta({reset: false, shallow: false});

    fileWatcher.emit('change', {
      eventsQueue: [
        {type: 'change', filePath: '/ctx/foo', metadata: {type: 'f'}},
      ],
    });

    // Incremental build
    await deltaCalculator.getDelta({
      reset: false,
      shallow: false,
    });

    expect(traverseDependencies).toBeCalledWith(
      ['/ctx/foo'],
      expect.anything(),
    );

    expect(traverseDependencies).toBeCalledTimes(1);
  });

  test('modifying a potential match of a context, without adding it, does not trigger a rebuild', async () => {
    // Initial build
    await deltaCalculator.getDelta({reset: false, shallow: false});

    fileWatcher.emit('change', {
      eventsQueue: [
        {type: 'change', filePath: '/ctx/foo2', metadata: {type: 'f'}},
      ],
    });

    // Incremental build
    await deltaCalculator.getDelta({
      reset: false,
      shallow: false,
    });

    expect(traverseDependencies).not.toBeCalled();
  });

  test('adding a file to a context, and immediately modifying it, marks the context as modified', async () => {
    // Initial build
    await deltaCalculator.getDelta({reset: false, shallow: false});

    fileWatcher.emit('change', {
      eventsQueue: [
        {type: 'add', filePath: '/ctx/foo2', metadata: {type: 'f'}},
      ],
    });

    fileWatcher.emit('change', {
      eventsQueue: [
        {type: 'change', filePath: '/ctx/foo2', metadata: {type: 'f'}},
      ],
    });

    // Incremental build
    await deltaCalculator.getDelta({
      reset: false,
      shallow: false,
    });

    expect(traverseDependencies).toBeCalledWith(
      ['/ctx?ctx=xxx'],
      expect.anything(),
    );

    expect(traverseDependencies).toBeCalledTimes(1);
  });

  test('adding a file to a context, and immediately removing it, does not trigger a rebuild', async () => {
    // Initial build
    await deltaCalculator.getDelta({reset: false, shallow: false});

    fileWatcher.emit('change', {
      eventsQueue: [
        {type: 'add', filePath: '/ctx/foo2', metadata: {type: 'f'}},
      ],
    });

    fileWatcher.emit('change', {
      eventsQueue: [
        {type: 'delete', filePath: '/ctx/foo2', metadata: {type: 'f'}},
      ],
    });

    // Incremental build
    await deltaCalculator.getDelta({
      reset: false,
      shallow: false,
    });

    expect(traverseDependencies).not.toBeCalled();
  });

  test('removing a file from a context, and immediately adding it back, only rebuilds the file itself', async () => {
    // Initial build
    await deltaCalculator.getDelta({reset: false, shallow: false});

    fileWatcher.emit('change', {
      eventsQueue: [
        {type: 'delete', filePath: '/ctx/foo', metadata: {type: 'f'}},
      ],
    });

    fileWatcher.emit('change', {
      eventsQueue: [{type: 'add', filePath: '/ctx/foo', metadata: {type: 'f'}}],
    });

    // Incremental build
    await deltaCalculator.getDelta({
      reset: false,
      shallow: false,
    });

    expect(traverseDependencies).toBeCalledWith(
      ['/ctx/foo'],
      expect.anything(),
    );
  });

  test('modifying an existing file in a context, and immediately removing it, marks the context as modified', async () => {
    // Initial build
    await deltaCalculator.getDelta({reset: false, shallow: false});

    fileWatcher.emit('change', {
      eventsQueue: [
        {type: 'change', filePath: '/ctx/foo', metadata: {type: 'f'}},
      ],
    });

    fileWatcher.emit('change', {
      eventsQueue: [
        {type: 'delete', filePath: '/ctx/foo', metadata: {type: 'f'}},
      ],
    });

    // Incremental build
    await deltaCalculator.getDelta({
      reset: false,
      shallow: false,
    });

    expect(traverseDependencies).toBeCalledWith(
      ['/ctx?ctx=xxx'],
      expect.anything(),
    );

    expect(traverseDependencies).toBeCalledTimes(1);
  });
});
