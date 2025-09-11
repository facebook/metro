/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @format
 * @oncall react_native
 */

import type {BundleOptions} from 'metro/private/shared/types';

export type ActionLogEntryData = {
  action_name: string;
  log_entry_label?: string;
};
export type ActionStartLogEntry = {
  action_name?: string;
  action_phase?: string;
  log_entry_label: string;
  log_session?: string;
  start_timestamp?: [number, number];
};
export type LogEntry = {
  action_name?: string;
  action_phase?: string;
  action_result?: string;
  duration_ms?: number;
  entry_point?: string;
  file_name?: string;
  log_entry_label: string;
  log_session?: string;
  start_timestamp?: [number, number];
  outdated_modules?: number;
  bundle_size?: number;
  bundle_options?: BundleOptions;
  bundle_hash?: string;
  build_id?: string;
  error_message?: string;
  error_stack?: string;
};
declare function on(event: string, handler: (logEntry: LogEntry) => void): void;
declare function createEntry(data: LogEntry | string): LogEntry;
declare function createActionStartEntry(
  data: ActionLogEntryData | string,
): LogEntry;
declare function createActionEndEntry(
  logEntry: ActionStartLogEntry,
  error?: null | undefined | Error,
): LogEntry;
declare function log(logEntry: LogEntry): LogEntry;
export {on, createEntry, createActionStartEntry, createActionEndEntry, log};
