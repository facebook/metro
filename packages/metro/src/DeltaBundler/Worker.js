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

import type {
  JsTransformOptions,
  JsTransformerConfig,
} from '../JSTransformer/worker';
import type {MixedOutput, TransformResultDependency} from './types.flow';
import type {LogEntry} from 'metro-core/src/Logger';

export type {
  JsTransformOptions as TransformOptions,
} from '../JSTransformer/worker';

export type Worker = {
  transform: typeof transform,
  setup: typeof setup,
};

export type TransformerFn<T: MixedOutput> = (
  string,
  Buffer,
  JsTransformOptions,
) => Promise<Result<T>>;

export type TransformerConfig = {
  transformerPath: string,
  transformerConfig: JsTransformerConfig,
};

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

let transformer;
let projectRoot;

function setup(
  projectRootArg: string,
  {transformerPath, transformerConfig}: TransformerConfig,
) {
  // eslint-disable-next-line lint/flow-no-fixme
  // $FlowFixMe Transforming fixed types to generic types during refactor.
  const Transformer = require(transformerPath);

  projectRoot = projectRootArg;
  transformer = new Transformer(projectRoot, transformerConfig);
}

async function transform<T: MixedOutput>(
  filename: string,
  transformOptions: JsTransformOptions,
  projectRootArg: string,
  transformerConfig: TransformerConfig,
): Promise<Data<T>> {
  if (!projectRoot) {
    setup(projectRootArg, transformerConfig);
  }

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

  const result = await transformer.transform(filename, data, transformOptions);

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
  setup,
  transform,
};
