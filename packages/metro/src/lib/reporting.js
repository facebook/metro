/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow
 * @format
 */

'use strict';

const chalk = require('chalk');
const {Terminal} = require('metro-core');
const stripAnsi = require('strip-ansi');
const util = require('util');

export type GlobalCacheDisabledReason = 'too_many_errors' | 'too_many_misses';

export type BundleDetails = {
  bundleType: string,
  dev: boolean,
  entryFile: string,
  minify: boolean,
  platform: ?string,
  runtimeBytecodeVersion: ?number,
  ...
};

/**
 * A tagged union of all the actions that may happen and we may want to
 * report to the tool user.
 */
export type ReportableEvent =
  | {
      port: number,
      hasReducedPerformance: boolean,
      type: 'initialize_started',
      ...
    }
  | {
      type: 'initialize_failed',
      port: number,
      error: Error,
      ...
    }
  | {
      type: 'initialize_done',
      port: number,
    }
  | {
      buildID: string,
      type: 'bundle_build_done',
      ...
    }
  | {
      buildID: string,
      type: 'bundle_build_failed',
      ...
    }
  | {
      buildID: string,
      bundleDetails: BundleDetails,
      type: 'bundle_build_started',
      ...
    }
  | {
      error: Error,
      type: 'bundling_error',
      ...
    }
  | {
      type: 'dep_graph_loading',
      hasReducedPerformance: boolean,
      ...
    }
  | {type: 'dep_graph_loaded', ...}
  | {
      buildID: string,
      type: 'bundle_transform_progressed',
      transformedFileCount: number,
      totalFileCount: number,
      ...
    }
  | {
      type: 'global_cache_error',
      error: Error,
      ...
    }
  | {
      type: 'global_cache_disabled',
      reason: GlobalCacheDisabledReason,
      ...
    }
  | {type: 'transform_cache_reset', ...}
  | {
      type: 'worker_stdout_chunk',
      chunk: string,
      ...
    }
  | {
      type: 'worker_stderr_chunk',
      chunk: string,
      ...
    }
  | {
      type: 'hmr_client_error',
      error: Error,
      ...
    }
  | {
      type: 'client_log',
      level:
        | 'trace'
        | 'info'
        | 'warn'
        | 'log'
        | 'group'
        | 'groupCollapsed'
        | 'groupEnd'
        | 'debug',
      data: Array<mixed>,
      mode: 'BRIDGE' | 'NOBRIDGE',
      ...
    }
  | {
      type: 'transformer_load_started',
    }
  | {
      type: 'transformer_load_done',
    }
  | {
      type: 'transformer_load_failed',
      error: Error,
    };

/**
 * Code across the application takes a reporter as an option and calls the
 * update whenever one of the ReportableEvent happens. Code does not directly
 * write to the standard output, because a build would be:
 *
 *   1. ad-hoc, embedded into another tool, in which case we do not want to
 *   pollute that tool's own output. The tool is free to present the
 *   warnings/progress we generate any way they want, by specifing a custom
 *   reporter.
 *   2. run as a background process from another tool, in which case we want
 *   to expose updates in a way that is easily machine-readable, for example
 *   a JSON-stream. We don't want to pollute it with textual messages.
 *
 * We centralize terminal reporting into a single place because we want the
 * output to be robust and consistent. The most common reporter is
 * TerminalReporter, that should be the only place in the application should
 * access the `terminal` module (nor the `console`).
 */
export type Reporter = interface {update(event: ReportableEvent): void};

/**
 * A standard way to log a warning to the terminal. This should not be called
 * from some arbitrary Metro logic, only from the reporters. Instead of
 * calling this, add a new type of ReportableEvent instead, and implement a
 * proper handler in the reporter(s).
 */
function logWarning(
  terminal: Terminal,
  format: string,
  ...args: Array<mixed>
): void {
  const str = util.format(format, ...args);
  terminal.log('%s: %s', chalk.yellow('warning'), str);
}

/**
 * Similar to `logWarning`, but for messages that require the user to act.
 */
function logError(
  terminal: Terminal,
  format: string,
  ...args: Array<mixed>
): void {
  terminal.log(
    '%s: %s',
    chalk.red('error'),
    // Syntax errors may have colors applied for displaying code frames
    // in various places outside of where Metro is currently running.
    // If the current terminal does not support color, we'll strip the colors
    // here.
    util.format(chalk.supportsColor ? format : stripAnsi(format), ...args),
  );
}

/**
 * A reporter that does nothing. Errors and warnings will be swallowed, that
 * is generally not what you want.
 */
const nullReporter = {update(): void {}};

module.exports = {
  logWarning,
  logError,
  nullReporter,
};
