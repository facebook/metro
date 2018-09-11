/**
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow
 * @format
 */

'use strict';

const crypto = require('crypto');
const fs = require('fs');

import type {WorkerOptions as JsWorkerOptions} from '../JSTransformer/worker';
import type {TransformResultDependency} from '../ModuleGraph/types.flow';
import type {LocalPath} from '../node-haste/lib/toLocalPath';
import type {MixedOutput} from './types.flow';
import type {LogEntry} from 'metro-core/src/Logger';

export type WorkerOptions = JsWorkerOptions;
export type WorkerFn = typeof transform;
export type TransformerFn<T: MixedOutput> = (
  string,
  LocalPath,
  Buffer,
  WorkerOptions,
) => Promise<Result<T>>;

type Result<T: MixedOutput> = {|
  output: $ReadOnlyArray<T>,
  dependencies: $ReadOnlyArray<TransformResultDependency>,
|};

type Data<T: MixedOutput> = {
  result: Result<T>,
  sha1: string,
  transformFileStartLogEntry: LogEntry,
  transformFileEndLogEntry: LogEntry,
};

async function transform<T: MixedOutput>(
  filename: string,
  localPath: LocalPath,
  transformerPath: string,
  transformerOptions: WorkerOptions,
): Promise<Data<T>> {
  const transformFileStartLogEntry = {
    action_name: 'Transforming file',
    action_phase: 'start',
    file_name: filename,
    log_entry_label: 'Transforming file',
    start_timestamp: process.hrtime(),
  };

  const data = fs.readFileSync(filename);
  const sha1 = crypto
    .createHash('sha1')
    .update(data)
    .digest('hex');

  // eslint-disable-next-line lint/flow-no-fixme
  // $FlowFixMe Transforming fixed types to generic types during refactor.
  const {transform} = (require(transformerPath): {
    transform: TransformerFn<T>,
  });

  const result = await transform(filename, localPath, data, transformerOptions);

  const transformFileEndLogEntry = getEndLogEntry(
    transformFileStartLogEntry,
    filename,
  );

  return {
    result,
    sha1,
    transformFileStartLogEntry,
    transformFileEndLogEntry,
  };
}

function getEndLogEntry(startLogEntry: LogEntry, filename: string): LogEntry {
  const timeDelta = process.hrtime(startLogEntry.start_timestamp);
  const duration_ms = Math.round((timeDelta[0] * 1e9 + timeDelta[1]) / 1e6);

  return {
    action_name: 'Transforming file',
    action_phase: 'end',
    file_name: filename,
    duration_ms,
    log_entry_label: 'Transforming file',
  };
}

module.exports = {
  transform,
};
