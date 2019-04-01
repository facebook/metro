/**
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @emails oncall+metro_bundler
 * @flow strict-local
 * @format
 */

'use strict';

const Module = require('../Module');

expect.extend({
  toHave(segment, child) {
    return {
      message: () => 'Segment does not contain ' + child.getModulePath(),
      pass: segment.hasModule(child),
    };
  },
});

test('modules can be created', () => {
  expect(() => new Module('foo.js')).not.toThrow();
});

test('modules have a path', () => {
  const module = new Module('foo.js');

  expect(module.getModulePath()).toBe('foo.js');
});

test('modules contain data', () => {
  const module = new Module('foo.js');
  const data = {bar: 42};

  // Data cannot be obtained before setting it.
  expect(() => module.getOutput()).toThrow(ReferenceError);

  module.setOutput(data);
  expect(module.getOutput()).toBe(data);
});

test('dependencies added are correctly reflected', () => {
  const moduleParent = new Module('parent.js');
  const moduleChild = new Module('child.js');
  const moduleSubchild = new Module('subchild.js');

  moduleParent.addDependency(moduleChild);
  moduleChild.addDependency(moduleSubchild);

  expect(moduleParent.getDependencies()).toHave(moduleChild);
  expect(moduleParent.getDependencies()).not.toHave(moduleSubchild);

  expect(moduleParent.getTransitiveDependencies()).toHave(moduleChild);
  expect(moduleParent.getTransitiveDependencies()).toHave(moduleChild);

  // A module is never a dependency or a transitive dependency of itself.
  expect(moduleParent.getDependencies()).not.toHave(moduleParent);
  expect(moduleParent.getTransitiveDependencies()).not.toHave(moduleParent);
});

test('inverse dependencies added are correctly reflected', () => {
  const moduleParent = new Module('parent.js');
  const moduleChild = new Module('child.js');

  moduleParent.addDependency(moduleChild);
  moduleChild.deleteInverseDependency(moduleParent);

  expect(moduleParent.getDependencies()).not.toHave(moduleChild);
  expect(moduleChild.getInverseDependencies()).not.toHave(moduleParent);
});

test('adding or removing a dependency twice does not make the implementation throw', () => {
  const moduleParent = new Module('parent.js');
  const moduleChild = new Module('child.js');

  moduleParent.addDependency(moduleChild);
  expect(() => moduleParent.addDependency(moduleChild)).not.toThrow();

  moduleParent.deleteDependency(moduleChild);
  expect(() => moduleParent.deleteDependency(moduleChild)).not.toThrow();

  moduleChild.addInverseDependency(moduleParent);
  expect(() => moduleChild.addInverseDependency(moduleParent)).not.toThrow();

  moduleChild.deleteInverseDependency(moduleParent);
  expect(() => moduleChild.deleteInverseDependency(moduleParent)).not.toThrow();
});

test('can return a segment from a given module', () => {
  const module = new Module('foo.js');
  const segment = module.asSegment();

  expect(segment).toHave(module);
  expect(Array.from(segment).length).toBe(1);
});

test('transitive dependencies are returned, in order, in a DFS fashion', () => {
  /*
   * Represents:
   *
   *      --------------------
   *    /                      \
   *   |         A              |
   *    \      /   \            |
   *      --> B      C          |
   *        /   \  /   \       /
   *      D      E       F >--
   */

  const A = new Module('a.js');
  const B = new Module('b.js');
  const C = new Module('c.js');
  const D = new Module('d.js');
  const E = new Module('e.js');
  const F = new Module('f.js');

  A.addDependency(B);
  A.addDependency(C);

  B.addDependency(D);
  B.addDependency(E);

  C.addDependency(E);
  C.addDependency(F);

  F.addDependency(B);

  expect(
    Array.from(A.getTransitiveDependencies()).map(m => m.getModulePath()),
  ).toEqual(['b.js', 'd.js', 'e.js', 'c.js', 'f.js']);
});
