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

const Segment = require('./Segment');

module.exports = class Module<T> {
  _dependencies: Set<Module<T>> = new Set();
  _inverseDependencies: Set<Module<T>> = new Set();
  _modulePath: string;
  _output: ?T = null;

  constructor(modulePath: string) {
    this._modulePath = modulePath;
  }

  getModulePath() {
    return this._modulePath;
  }

  addDependency(module: Module<T>) {
    const dependencies = this._dependencies;

    if (dependencies.has(module)) {
      return;
    }

    dependencies.add(module);
    module.addInverseDependency(module);
  }

  addInverseDependency(module: Module<T>) {
    const inverseDependencies = this._inverseDependencies;

    if (inverseDependencies.has(module)) {
      return;
    }

    inverseDependencies.add(module);
    module.addDependency(this);
  }

  deleteDependency(module: Module<T>) {
    const dependencies = this._dependencies;

    if (!dependencies.has(module)) {
      return;
    }

    dependencies.delete(module);
    module.deleteInverseDependency(this);
  }

  deleteInverseDependency(module: Module<T>) {
    const inverseDependencies = this._inverseDependencies;

    if (inverseDependencies.has(module)) {
      return;
    }

    inverseDependencies.delete(module);
    module.deleteDependency(this);
  }

  getDependencies(): Segment<T> {
    return new Segment(this._dependencies);
  }

  getTransitiveDependencies(): Segment<T> {
    const transitiveDependencies = new Segment();
    const stack = [this];

    while (stack.length > 0) {
      const dependency = stack.pop();

      if (!transitiveDependencies.hasModule(dependency)) {
        const dependencies = Array.from(dependency.getDependencies());

        for (let i = dependencies.length - 1; i >= 0; i--) {
          stack.push(dependencies[i]);
        }

        transitiveDependencies.addModule(dependency);
      }
    }

    // A module is not a dependency of itself.
    return transitiveDependencies.deleteModule(this);
  }

  getInverseDependencies(): Segment<T> {
    return new Segment(this._inverseDependencies);
  }

  asSegment(): Segment<T> {
    return new Segment([this]);
  }

  getOutput(): T {
    const output = this._output;

    if (output == null) {
      throw new ReferenceError('Module did not have an output assigned');
    }

    return output;
  }

  setOutput(output: T) {
    this._output = output;
  }
};
