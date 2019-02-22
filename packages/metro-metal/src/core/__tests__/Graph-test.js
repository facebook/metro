/**
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @emails oncall+javascript_foundation
 * @flow strict-local
 * @format
 */

'use strict';

const Graph = require('../Graph');
const Module = require('../Module');

test('allows simple graph creation', () => {
  expect(() => new Graph([new Module('foo.js')])).not.toThrow();
});

test('can check if an entry point is present', () => {
  const graph = new Graph();
  const entryPoint = new Module('ep.js');

  expect(graph.hasEntryPoint(entryPoint)).toBe(false);
  expect(graph.hasEntryPointByPath('ep.js')).toBe(false);

  graph.addEntryPoint(entryPoint);

  expect(graph.hasEntryPoint(entryPoint)).toBe(true);
  expect(graph.hasEntryPointByPath('ep.js')).toBe(true);
});

test('can add entry points', () => {
  const graph = new Graph();
  const entryPoint = new Module('ep.js');

  expect(() => graph.addEntryPointByPath()).toThrow(TypeError);
  expect(() => graph.addEntryPoint(entryPoint)).not.toThrow();
  expect(() => graph.addEntryPoint(entryPoint)).toThrow(ReferenceError);
});

test('can delete entry points', () => {
  const graph = new Graph();
  const entryPoint = new Module('ep.js');

  graph.addEntryPoint(entryPoint);

  expect(() => graph.deleteEntryPoint(entryPoint)).not.toThrow();
  expect(() => graph.deleteEntryPoint(entryPoint)).toThrow(ReferenceError);

  graph.addEntryPoint(entryPoint);

  expect(() => graph.deleteEntryPointByPath('ep.js')).not.toThrow();
  expect(() => graph.deleteEntryPointByPath('ep.js')).toThrow(ReferenceError);
});

test('listing entrypoints returns a segment with all of them', () => {
  const graph = new Graph();
  const entryPoint1 = new Module('ep1.js');
  const entryPoint2 = new Module('ep2.js');

  graph.addEntryPoint(entryPoint1);
  graph.addEntryPoint(entryPoint2);

  expect(
    Array.from(graph.getEntryPoints()).map(x => x.getModulePath()),
  ).toEqual(['ep1.js', 'ep2.js']);
});
