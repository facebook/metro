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
const path = require('path');

import type {TransformResult} from './types.flow';
import type {LogEntry} from 'metro-core/src/Logger';
import type {
  JsTransformOptions,
  JsTransformerConfig,
} from 'metro-transform-worker';

export type {JsTransformOptions as TransformOptions} from 'metro-transform-worker';

export type Worker = {|
  +transform: typeof transform,
|};

type TransformerInterface = {
  transform(
    JsTransformerConfig,
    string,
    string,
    Buffer,
    JsTransformOptions,
  ): Promise<TransformResult<>>,
};

export type TransformerConfig = {
  transformerPath: string,
  transformerConfig: JsTransformerConfig,
  ...
};

type Data = $ReadOnly<{|
  result: TransformResult<>,
  sha1: string,
  transformFileStartLogEntry: LogEntry,
  transformFileEndLogEntry: LogEntry,
|}>;

async function transform(
  filename: string,
  transformOptions: JsTransformOptions,
  projectRoot: string,
  transformerConfig: TransformerConfig,
): Promise<Data> {
  // eslint-disable-next-line no-useless-call
  const Transformer = (require.call(
    null,
    transformerConfig.transformerPath,
  ): TransformerInterface);

  const transformFileStartLogEntry = {
    action_name: 'Transforming file',
    action_phase: 'start',
    file_name: filename,
    log_entry_label: 'Transforming file',
    start_timestamp: process.hrtime(),
  };

  const data = fs.readFileSync(path.resolve(projectRoot, filename));
  const sha1 = crypto
    .createHash('sha1')
    .update(data)
    .digest('hex');

  const result = await Transformer.transform(
    transformerConfig.transformerConfig,
    projectRoot,
    filename,
    data,
    transformOptions,
  );

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

module.exports = ({
  transform,
}: Worker);
