/**
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @emails oncall+metro_bundler
 * @format
 */

'use strict';

jest.mock('../../Bundler');
jest.mock('../DeltaCalculator');

const Bundler = require('../../Bundler');
const DeltaCalculator = require('../DeltaCalculator');

const DeltaBundler = require('../../DeltaBundler');

describe('DeltaBundler', () => {
  let deltaBundler;
  let bundler;

  const graph = {
    dependencides: new Map([
      ['/entry', {code: 'entry'}],
      ['/foo', {code: 'foo'}],
    ]),
    entryPoints: ['/entry'],
  };

  beforeEach(() => {
    bundler = new Bundler();
    deltaBundler = new DeltaBundler(bundler, {});

    DeltaCalculator.prototype.getDelta.mockImplementation(async ({reset}) =>
      Promise.resolve({
        modified: reset ? graph.dependencies : new Map(),
        deleted: new Set(),
        reset,
      }),
    );

    DeltaCalculator.prototype.getGraph.mockReturnValue(graph);
  });

  it('should create a new graph when buildGraph gets called', async () => {
    expect(await deltaBundler.buildGraph({}, {shallow: false})).toEqual(graph);

    expect(DeltaCalculator.prototype.getDelta.mock.calls[0][0]).toEqual({
      reset: true,
      shallow: false,
    });
  });

  it('should get a delta when getDelta gets called', async () => {
    const graph = await deltaBundler.buildGraph({}, {shallow: false});

    expect(await deltaBundler.getDelta(graph, {reset: false})).toEqual({
      modified: new Map(),
      deleted: new Set(),
      reset: false,
    });
  });

  it('should get a reset delta when calling getDelta({reset: true})', async () => {
    const graph = await deltaBundler.buildGraph({}, {shallow: false});

    expect(await deltaBundler.getDelta(graph, {reset: true})).toEqual({
      modified: graph.dependencies,
      deleted: new Set(),
      reset: true,
    });
  });

  it('should throw an error when trying to get the delta of a graph that does not exist', async () => {
    const graph = await deltaBundler.buildGraph({}, {shallow: false});

    deltaBundler.endGraph(graph);

    await expect(
      deltaBundler.getDelta(graph, {reset: false}),
    ).rejects.toBeInstanceOf(Error);
  });

  it('should throw an error when trying to end a graph twice', async () => {
    const graph = await deltaBundler.buildGraph({}, {shallow: false});

    deltaBundler.endGraph(graph);

    expect(() => deltaBundler.endGraph(graph)).toThrow();
  });
});
