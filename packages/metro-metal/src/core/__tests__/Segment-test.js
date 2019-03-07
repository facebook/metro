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

const Module = require('../Module');
const Segment = require('../Segment');

test('allows simple segment creation', () => {
  expect(() => new Segment([new Module('foo.js')])).not.toThrow();
});

test('auto-clones when passing it as the constructor parameter', () => {
  const segment = new Segment();

  const moduleFoo = new Module('foo.js');
  const moduleBar = new Module('bar.js');

  segment.addModule(moduleFoo);
  segment.addModule(moduleBar);

  const copy = new Segment(segment);

  expect(copy.hasModule(moduleFoo)).toBe(true);
  expect(copy.hasModule(moduleBar)).toBe(true);
});

test('ensures correct iteration via Symbol.iterator', () => {
  const segment = new Segment();
  const modules = [];

  segment.addModule(new Module('foo.js'));
  segment.addModule(new Module('bar.js'));

  // Iterate via "Symbol.iterator".
  for (const module of segment) {
    modules.push(module);
  }

  expect(modules.length).toBe(2);
  expect(modules[0].getModulePath()).toBe('foo.js');
  expect(modules[1].getModulePath()).toBe('bar.js');
});

test('ensures correct iteration via forEach', () => {
  const segment = new Segment();
  const modules = [];

  segment.addModule(new Module('foo.js'));
  segment.addModule(new Module('bar.js'));

  // Iterate via "forEach".
  segment.forEach(module => {
    modules.push(module);
  });

  expect(modules.length).toBe(2);
  expect(modules[0].getModulePath()).toBe('foo.js');
  expect(modules[1].getModulePath()).toBe('bar.js');
});

test('ensures correct mapping', () => {
  const segment = new Segment();

  segment.addModule(new Module('foo.js'));
  segment.addModule(new Module('bar.js'));

  const modules = segment.map(module => {
    return module.getModulePath();
  });

  expect(modules.length).toBe(2);
  expect(modules).toEqual(['foo.js', 'bar.js']);
});

test('ensures correct filtering', () => {
  const segment = new Segment();

  segment.addModule(new Module('foo.js'));
  segment.addModule(new Module('bar.js'));

  const modules = segment.filter(module => {
    return module.getModulePath() === 'foo.js';
  });

  const arrayModules = Array.from(modules);

  expect(arrayModules.length).toBe(1);
  expect(arrayModules[0].getModulePath()).toBe('foo.js');
});

test('ensures correct detection of modules', () => {
  const segment = new Segment();
  const moduleFoo = new Module('foo.js');
  const moduleBar = new Module('bar.js');

  segment.addModule(moduleFoo);

  expect(segment.hasModule(moduleFoo)).toBe(true);
  expect(segment.hasModule(moduleBar)).toBe(false);

  expect(segment.hasModuleByPath('foo.js')).toBe(true);
  expect(segment.hasModuleByPath('bar.js')).toBe(false);
});

test('ensures correct retrieval of modules', () => {
  const segment = new Segment();
  const moduleFoo = new Module('foo.js');

  segment.addModule(moduleFoo);

  expect(() => segment.getModule()).toThrow(TypeError);
  expect(() => segment.getModuleByPath('foo.js')).not.toThrow();
  expect(() => segment.getModuleByPath('bar.js')).toThrow(ReferenceError);
});

test('ensures correct storage of modules', () => {
  const segment = new Segment();
  const moduleFoo = new Module('foo.js');

  expect(() => segment.addModuleByPath()).toThrow(TypeError);
  expect(() => segment.addModule(moduleFoo)).not.toThrow();
  expect(() => segment.addModule(moduleFoo)).toThrow(ReferenceError);
});

test('ensures correct deletion of modules', () => {
  const segment = new Segment();
  const moduleFoo = new Module('foo.js');

  segment.addModule(moduleFoo);

  expect(() => segment.deleteModule(moduleFoo)).not.toThrow();
  expect(() => segment.deleteModule(moduleFoo)).toThrow(ReferenceError);
  expect(() => segment.getModuleByPath('foo.js')).toThrow(ReferenceError);

  segment.addModule(moduleFoo);

  expect(() => segment.deleteModuleByPath('foo.js')).not.toThrow();
  expect(() => segment.deleteModuleByPath('foo.js')).toThrow(ReferenceError);
  expect(() => segment.getModuleByPath('foo.js')).toThrow(ReferenceError);
});

test('joins segments', () => {
  const segmentFoo = new Segment();
  const segmentBar = new Segment();
  const moduleFoo = new Module('foo.js');
  const moduleBar = new Module('bar.js');
  const moduleBaz = new Module('baz.js');

  segmentFoo.addModule(moduleFoo).addModule(moduleBar);
  segmentBar.addModule(moduleBar).addModule(moduleBaz);

  const joint = segmentFoo
    .joinSegment(segmentBar)
    .map(module => module.getModulePath());

  expect(joint).toEqual(['foo.js', 'bar.js', 'baz.js']);
});

test('subtracts segments', () => {
  const segmentFoo = new Segment();
  const segmentBar = new Segment();
  const moduleFoo = new Module('foo.js');
  const moduleBar = new Module('bar.js');

  segmentFoo.addModule(moduleFoo).addModule(moduleBar);
  segmentBar.addModule(moduleBar);

  const subtracted = segmentFoo
    .subtractSegment(segmentBar)
    .map(module => module.getModulePath());

  expect(subtracted).toEqual(['foo.js']);
});

test('intersects segments', () => {
  const segmentFoo = new Segment();
  const segmentBar = new Segment();
  const moduleFoo = new Module('foo.js');
  const moduleBar = new Module('bar.js');

  segmentFoo.addModule(moduleFoo).addModule(moduleBar);
  segmentBar.addModule(moduleBar);

  const intersected = segmentFoo
    .intersectSegment(segmentBar)
    .map(module => module.getModulePath());

  expect(intersected).toEqual(['bar.js']);
});

test('diffs segments', () => {
  const segmentFoo = new Segment();
  const segmentBar = new Segment();
  const moduleFoo = new Module('foo.js');
  const moduleBar = new Module('bar.js');
  const moduleBaz = new Module('baz.js');

  segmentFoo.addModule(moduleFoo).addModule(moduleBar);
  segmentBar.addModule(moduleBar).addModule(moduleBaz);

  const {added, deleted} = segmentFoo.diffSegment(segmentBar);
  const addedArray = added.map(module => module.getModulePath());
  const deletedArray = deleted.map(module => module.getModulePath());

  expect(addedArray).toEqual(['baz.js']);
  expect(deletedArray).toEqual(['foo.js']);
});
