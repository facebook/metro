/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @format
 * @oncall react_native
 */

import {ReportableEvent} from './reporting';
import {Terminal} from 'metro-core';

export type TerminalReportableEvent =
  | ReportableEvent
  | {
      buildID: string;
      type: 'bundle_transform_progressed_throttled';
      transformedFileCount: number;
      totalFileCount: number;
    };

export class TerminalReporter {
  constructor(terminal: Terminal);
  readonly terminal: Terminal;
  update(event: TerminalReportableEvent): void;
}
