/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @format
 */

import type {
  MetadataWorker,
  V8Serializable,
  WorkerMessage,
} from '../../flow-types';

declare class Worker implements MetadataWorker {
  constructor(opts: Readonly<{hasteImplModulePath: null | undefined | string}>);
  processFile(
    data: WorkerMessage,
    utils: Readonly<{getContent: () => Buffer}>,
  ): V8Serializable;
}

export = Worker;
