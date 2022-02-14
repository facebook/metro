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

const invariant = require('invariant');

type ProcessBatch<TItem, TResult> = (
  batch: Array<TItem>,
) => Promise<Array<TResult>>;

type BatchProcessorOptions = {
  maximumDelayMs: number,
  maximumItems: number,
  concurrency: number,
  ...
};

type QueueItem<TItem, TResult> = {
  item: TItem,
  reject: (error: mixed) => mixed,
  resolve: (result: TResult) => mixed,
  ...
};

/**
 * We batch items together trying to minimize their processing, for example as
 * network queries. For that we wait a small moment before processing a batch.
 * We limit also the number of items we try to process in a single batch so that
 * if we have many items pending in a short amount of time, we can start
 * processing right away.
 */
class BatchProcessor<TItem, TResult> {
  _currentProcessCount: number;
  _options: BatchProcessorOptions;
  _processBatch: ProcessBatch<TItem, TResult>;
  _queue: Array<QueueItem<TItem, TResult>>;
  _timeoutHandle: ?TimeoutID;

  constructor(
    options: BatchProcessorOptions,
    processBatch: ProcessBatch<TItem, TResult>,
  ) {
    this._options = options;
    this._processBatch = processBatch;
    this._queue = [];
    this._timeoutHandle = null;
    this._currentProcessCount = 0;
    // $FlowFixMe[method-unbinding] added when improving typing for this parameters
    (this: any)._processQueue = this._processQueue.bind(this);
  }

  _onBatchFinished(): void {
    this._currentProcessCount--;
    this._processQueueOnceReady();
  }

  _onBatchResults(
    jobs: Array<QueueItem<TItem, TResult>>,
    results: Array<TResult>,
  ): void {
    invariant(results.length === jobs.length, 'Not enough results returned.');
    for (let i = 0; i < jobs.length; ++i) {
      jobs[i].resolve(results[i]);
    }
    this._onBatchFinished();
  }

  _onBatchError(jobs: Array<QueueItem<TItem, TResult>>, error: mixed): void {
    for (let i = 0; i < jobs.length; ++i) {
      jobs[i].reject(error);
    }
    this._onBatchFinished();
  }

  _processQueue(): void {
    this._timeoutHandle = null;
    const {concurrency} = this._options;
    while (this._queue.length > 0 && this._currentProcessCount < concurrency) {
      this._currentProcessCount++;
      const jobs = this._queue.splice(0, this._options.maximumItems);
      this._processBatch(
        jobs.map((job: QueueItem<TItem, TResult>) => job.item),
      ).then(
        // $FlowFixMe[method-unbinding] added when improving typing for this parameters
        this._onBatchResults.bind(this, jobs),
        // $FlowFixMe[method-unbinding] added when improving typing for this parameters
        this._onBatchError.bind(this, jobs),
      );
    }
  }

  _processQueueOnceReady(): void {
    if (this._queue.length >= this._options.maximumItems) {
      clearTimeout(this._timeoutHandle);
      // $FlowFixMe[method-unbinding] added when improving typing for this parameters
      process.nextTick(this._processQueue);
      return;
    }
    if (this._timeoutHandle == null) {
      this._timeoutHandle = setTimeout(
        // $FlowFixMe[method-unbinding] added when improving typing for this parameters
        this._processQueue,
        this._options.maximumDelayMs,
      );
    }
  }

  queue(item: TItem): Promise<TResult> {
    return new Promise(
      (
        resolve: (result: TResult) => mixed,
        reject: (error: mixed) => mixed,
      ) => {
        this._queue.push({item, resolve, reject});
        this._processQueueOnceReady();
      },
    );
  }
}

module.exports = BatchProcessor;
