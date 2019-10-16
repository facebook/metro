/**
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @format
 * @emails oncall+js_foundation
 * @flow strict-local
 */

'use strict';

const {
  createEntry,
  createActionStartEntry,
  createActionEndEntry,
} = require('../Logger');

/* eslint-disable no-console */
describe('Logger', () => {
  const originalConsoleLog = console.log;

  beforeEach(() => {
    // $FlowFixMe don't worry, state restored below
    console.log = jest.fn();
  });

  afterEach(() => {
    // $FlowFixMe
    console.log = originalConsoleLog;
  });

  it('creates simple log entries', () => {
    const logEntry = createEntry('Test');
    expect(logEntry).toEqual({
      log_entry_label: 'Test',
      log_session: expect.any(String),
      metro_bundler_version: expect.any(String),
    });
  });

  it('creates action start log entries', () => {
    const actionStartLogEntry = createActionStartEntry('Test');
    expect(actionStartLogEntry).toEqual({
      action_name: 'Test',
      action_phase: 'start',
      log_entry_label: 'Test',
      log_session: expect.any(String),
      metro_bundler_version: expect.any(String),
      start_timestamp: expect.any(Object),
    });
  });

  it('creates action end log entries', () => {
    const actionEndLogEntry = createActionEndEntry(
      createActionStartEntry('Test'),
    );
    expect(actionEndLogEntry).toEqual({
      action_name: 'Test',
      action_phase: 'end',
      duration_ms: expect.any(Number),
      log_entry_label: 'Test',
      log_session: expect.any(String),
      metro_bundler_version: expect.any(String),
      start_timestamp: expect.any(Object),
    });
  });
});
