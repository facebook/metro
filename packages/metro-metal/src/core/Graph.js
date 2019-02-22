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
const Segment = require('./Segment');

class Graph<T> extends Segment<T> {
  _entryPoints: Segment<T> = new Segment();

  getEntryPoints(): Segment<T> {
    return new Segment(this._entryPoints);
  }

  hasEntryPoint(entryPoint: Module<T>): boolean {
    return this._entryPoints.hasModule(entryPoint);
  }

  addEntryPoint(entryPoint: Module<T>): Graph<T> {
    this._entryPoints.addModule(entryPoint);

    return this;
  }

  deleteEntryPoint(entryPoint: Module<T>): Graph<T> {
    this._entryPoints.deleteModule(entryPoint);

    return this;
  }

  hasEntryPointByPath(entryPointPath: string): boolean {
    return this._entryPoints.hasModuleByPath(entryPointPath);
  }

  addEntryPointByPath(): Graph<T> {
    throw new TypeError(
      'Adding entry points can only be done via "addEntryPoint"',
    );
  }

  deleteEntryPointByPath(entryPointPath: string): Graph<T> {
    this._entryPoints.deleteModuleByPath(entryPointPath);

    return this;
  }
}

module.exports = Graph;
