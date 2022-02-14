/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @emails oncall+metro_bundler
 * @flow strict
 * @format
 */

'use strict';

const getPreludeCode = require('../getPreludeCode');
const vm = require('vm');

['development', 'production'].forEach((mode: string) => {
  describe(`${mode} mode`, () => {
    const isDev = mode === 'development';
    const globalPrefix = '';

    it('sets up `process.env.NODE_ENV` and `__DEV__`', () => {
      const sandbox: $FlowFixMe = {};
      vm.createContext(sandbox);
      vm.runInContext(getPreludeCode({isDev, globalPrefix}), sandbox);
      expect(sandbox.process.env.NODE_ENV).toEqual(mode);
      expect(sandbox.__DEV__).toEqual(isDev);
    });

    it('sets up `__METRO_GLOBAL_PREFIX__`', () => {
      const sandbox: $FlowFixMe = {};
      vm.createContext(sandbox);
      vm.runInContext(
        getPreludeCode({isDev, globalPrefix: '__metro'}),
        sandbox,
      );
      expect(sandbox.__METRO_GLOBAL_PREFIX__).toBe('__metro');
    });

    it('does not override an existing `process.env`', () => {
      const nextTick = () => {};
      const sandbox: $FlowFixMe = {process: {nextTick, env: {FOOBAR: 123}}};
      vm.createContext(sandbox);
      vm.runInContext(getPreludeCode({isDev, globalPrefix}), sandbox);
      expect(sandbox.process.env.NODE_ENV).toEqual(mode);
      expect(sandbox.process.env.FOOBAR).toEqual(123);
      expect(sandbox.process.nextTick).toEqual(nextTick);
    });

    it('allows to define additional variables', () => {
      const sandbox: $FlowFixMe = {};
      const FOO = '1';
      const BAR = 2;
      vm.createContext(sandbox);
      vm.runInContext(
        getPreludeCode({isDev, globalPrefix, extraVars: {FOO, BAR}}),
        sandbox,
      );
      expect(sandbox.FOO).toBe(FOO);
      expect(sandbox.BAR).toBe(BAR);
    });

    it('does not override core variables with additional variables', () => {
      const sandbox: $FlowFixMe = {};
      vm.createContext(sandbox);
      vm.runInContext(
        getPreludeCode({isDev, globalPrefix, extraVars: {__DEV__: 123}}),
        sandbox,
      );
      expect(sandbox.__DEV__).toBe(isDev);
    });
  });
});
