/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @format
 * @oncall react_native
 */

import type {BundleDetails, ReportableEvent} from './reporting';
import type {Terminal} from 'metro-core';
import type {HealthCheckResult, WatcherStatus} from 'metro-file-map';

type BundleProgress = {
  bundleDetails: BundleDetails;
  transformedFileCount: number;
  totalFileCount: number;
  ratio: number;
  isPrefetch?: boolean;
};
export type TerminalReportableEvent =
  | ReportableEvent
  | {
      buildID: string;
      type: 'bundle_transform_progressed_throttled';
      transformedFileCount: number;
      totalFileCount: number;
    }
  | {
      type: 'unstable_server_log';
      level: 'info' | 'warn' | 'error';
      data: string | Array<unknown>;
    }
  | {type: 'unstable_server_menu_updated'; message: string}
  | {type: 'unstable_server_menu_cleared'};
type BuildPhase = 'in_progress' | 'done' | 'failed';
interface SnippetError extends Error {
  code?: string;
  filename?: string;
  snippet?: string;
}
/**
 * We try to print useful information to the terminal for interactive builds.
 * This implements the `Reporter` interface from the './reporting' module.
 */
declare class TerminalReporter {
  /**
   * The bundle builds for which we are actively maintaining the status on the
   * terminal, ie. showing a progress bar. There can be several bundles being
   * built at the same time.
   */
  _activeBundles: Map<string, BundleProgress>;
  _interactionStatus: null | undefined | string;
  _scheduleUpdateBundleProgress: {
    (data: {
      buildID: string;
      transformedFileCount: number;
      totalFileCount: number;
    }): void;
    cancel(): void;
  };
  _prevHealthCheckResult: null | undefined | HealthCheckResult;
  readonly terminal: Terminal;
  constructor(terminal: Terminal);
  /**
   * Construct a message that represents the progress of a
   * single bundle build, for example:
   *
   *     BUNDLE path/to/bundle.js ▓▓▓▓▓░░░░░░░░░░░ 36.6% (4790/7922)
   */
  _getBundleStatusMessage(
    $$PARAM_0$$: BundleProgress,
    phase: BuildPhase,
  ): string;
  _logBundleBuildDone(buildID: string): void;
  _logBundleBuildFailed(buildID: string): void;
  _logInitializing(port: number, hasReducedPerformance: boolean): void;
  _logInitializingFailed(port: number, error: SnippetError): void;
  /**
   * This function is only concerned with logging and should not do state
   * or terminal status updates.
   */
  _log(event: TerminalReportableEvent): void;
  /**
   * We do not want to log the whole stacktrace for bundling error, because
   * these are operational errors, not programming errors, and the stacktrace
   * is not actionable to end users.
   */
  _logBundlingError(error: SnippetError): void;
  _logWorkerChunk(origin: 'stdout' | 'stderr', chunk: string): void;
  /**
   * Because we know the `totalFileCount` is going to progressively increase
   * starting with 1:
   * - We use Math.max(totalFileCount, 10) to prevent the ratio to raise too
   *   quickly when the total file count is low. (e.g 1/2 5/6)
   * - We prevent the ratio from going backwards.
   * - Instead, we use Math.pow(ratio, 2) to as a conservative measure of progress.
   */
  _updateBundleProgress($$PARAM_0$$: {
    buildID: string;
    transformedFileCount: number;
    totalFileCount: number;
  }): void;
  /**
   * This function is exclusively concerned with updating the internal state.
   * No logging or status updates should be done at this point.
   */
  _updateState(event: TerminalReportableEvent): void;
  /**
   * Return a status message that is always consistent with the current state
   * of the application. Having this single function ensures we don't have
   * different callsites overriding each other status messages.
   */
  _getStatusMessage(): string;
  _logHmrClientError(e: Error): void;
  _logWarning(message: string): void;
  _logWatcherHealthCheckResult(result: HealthCheckResult): void;
  _logWatcherStatus(status: WatcherStatus): void;
  /**
   * Single entry point for reporting events. That allows us to implement the
   * corresponding JSON reporter easily and have a consistent reporting.
   */
  update(event: TerminalReportableEvent): void;
}
export default TerminalReporter;
