/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @emails oncall+metro_bundler
 * @format
 * @flow strict-local
 */

'use strict';

jest.mock('../DeltaCalculator');

const DeltaBundler = require('../../DeltaBundler');
const DeltaCalculator = require('../DeltaCalculator');
const {EventEmitter} = require('events');

describe('DeltaBundler', () => {
  let deltaBundler;

  const mockGraph = {
    dependencies: new Map([
      ['/entry', {code: 'entry'}],
      ['/foo', {code: 'foo'}],
    ]),
    entryPoints: ['/entry'],
  };

  const options = {
    experimentalImportBundleSupport: false,
    onProgress: null,
    resolve: (from: string, to: string) => {
      throw new Error('Never called');
    },
    shallow: false,
    transform: (modulePath: string) => {
      throw new Error('Never called');
    },
    transformOptions: {
      // NOTE: These options are ignored because we mock out the transformer (via DeltaCalculator).
      dev: false,
      hot: false,
      minify: false,
      platform: null,
      runtimeBytecodeVersion: null,
      type: 'module',
      unstable_transformProfile: 'default',
    },
  };

  beforeEach(async () => {
    const fileEmitter = new EventEmitter();
    deltaBundler = new DeltaBundler(fileEmitter);

    // $FlowFixMe[method-unbinding] Jest class mocks and Flow don't mix
    DeltaCalculator.prototype.getDelta.mockImplementation(async ({reset}) =>
      Promise.resolve({
        modified: reset ? mockGraph.dependencies : new Map(),
        deleted: new Set(),
        reset,
      }),
    );

    // $FlowFixMe[method-unbinding] Jest class mocks and Flow don't mix
    DeltaCalculator.prototype.getGraph.mockReturnValue(mockGraph);
  });

  it('should create a new graph when buildGraph gets called', async () => {
    expect(
      await deltaBundler.buildGraph(mockGraph.entryPoints, options),
    ).toEqual(mockGraph);

    // $FlowFixMe[method-unbinding] Jest class mocks and Flow don't mix
    expect(DeltaCalculator.prototype.getDelta.mock.calls[0][0]).toEqual({
      reset: true,
      shallow: false,
    });
  });

  it('should get a delta when getDelta gets called', async () => {
    const graph = await deltaBundler.buildGraph(mockGraph.entryPoints, options);

    expect(
      await deltaBundler.getDelta(graph, {reset: false, shallow: false}),
    ).toEqual({
      modified: new Map(),
      deleted: new Set(),
      reset: false,
    });
  });

  it('should get a reset delta when calling getDelta({reset: true, shallow: false})', async () => {
    const graph = await deltaBundler.buildGraph(mockGraph.entryPoints, options);

    expect(
      await deltaBundler.getDelta(graph, {reset: true, shallow: false}),
    ).toEqual({
      modified: graph.dependencies,
      deleted: new Set(),
      reset: true,
    });
  });

  it('should throw an error when trying to get the delta of a graph that does not exist', async () => {
    const graph = await deltaBundler.buildGraph(mockGraph.entryPoints, options);

    deltaBundler.endGraph(graph);

    await expect(
      deltaBundler.getDelta(graph, {reset: false, shallow: false}),
    ).rejects.toBeInstanceOf(Error);
  });

  it('should throw an error when trying to end a graph twice', async () => {
    const graph = await deltaBundler.buildGraph(mockGraph.entryPoints, options);

    deltaBundler.endGraph(graph);

    expect(() => deltaBundler.endGraph(graph)).toThrow();
  });
});
