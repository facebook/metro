/**
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow strict-local
 * @format
 */

'use strict';

const Module = require('./Module');

export type SegmentDiff<T> = {|
  +added: Segment<T>,
  +deleted: Segment<T>,
|};

// prettier-ignore
class Segment<T> implements Iterable<Module<T>> {
  _modules: Map<string, Module<T>> = new Map();

  constructor(modules: Iterable<Module<T>> = []) {
    for (const module of modules) {
      this.addModule(module);
    }
  }

  /*:: @@iterator: () => Iterator<Module<T>>; */
  // eslint-disable-next-line lint/flow-no-fixme
  // $FlowFixMe: Flow does not have support for computed properties.
  [Symbol.iterator](): Iterator<Module<T>> {
    return this._modules.values();
  }

  forEach(callback: (Module<T>) => mixed): void {
    return this._modules.forEach(module => {
      callback(module);
    });
  }

  map<U>(callback: (Module<T>) => U): Array<U> {
    const result = [];

    this.forEach(module => {
      result.push(callback(module));
    });

    return result;
  }

  filter(callback: (Module<T>) => boolean): Segment<T> {
    const result = new Segment();

    this.forEach(module => {
      if (callback(module)) {
        result.addModule(module);
      }
    });

    return result;
  }

  hasModule(module: Module<T>): boolean {
    return this._modules.has(module.getModulePath());
  }

  getModule() {
    throw new TypeError(
      'Getting modules can only be done via "getModuleByPath"',
    );
  }

  addModule(module: Module<T>): Segment<T> {
    if (this.hasModule(module)) {
      throw new ReferenceError('Module already exists');
    }

    this._modules.set(module.getModulePath(), module);

    return this;
  }

  deleteModule(module: Module<T>): Segment<T> {
    if (!this.hasModule(module)) {
      throw new ReferenceError('Module not found');
    }

    this._modules.delete(module.getModulePath());

    return this;
  }

  hasModuleByPath(modulePath: string): boolean {
    return this._modules.has(modulePath);
  }

  getModuleByPath(modulePath: string): Module<T> {
    const module = this._modules.get(modulePath);

    if (!module) {
      throw new ReferenceError('Module not found');
    }

    return module;
  }

  addModuleByPath(): void {
    throw new TypeError('Adding modules can only be done via "addModule"');
  }

  deleteModuleByPath(modulePath: string): Segment<T> {
    if (!this._modules.has(modulePath)) {
      throw new ReferenceError('Module not found');
    }

    this._modules.delete(modulePath);

    return this;
  }

  joinSegment(segment: Segment<T>): Segment<T> {
    const result = new Segment(this);

    segment.forEach(module => {
      if (!result.hasModule(module)) {
        result.addModule(module);
      }
    });

    return result;
  }

  subtractSegment(segment: Segment<T>): Segment<T> {
    const result = new Segment<T>();

    this._modules.forEach(module => {
      if (!segment.hasModule(module)) {
        result.addModule(module);
      }
    });

    return result;
  }

  intersectSegment(segment: Segment<T>): Segment<T> {
    const result = new Segment<T>();

    this._modules.forEach(module => {
      if (segment.hasModule(module)) {
        result.addModule(module);
      }
    });

    return result;
  }

  diffSegment(original: Segment<T>): SegmentDiff<T> {
    return {
      added: original.subtractSegment(this),
      deleted: this.subtractSegment(original),
    };
  }
}

module.exports = Segment;
