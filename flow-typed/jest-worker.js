/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow strict
 * @format
 */

declare module 'jest-worker' {
  declare export var CHILD_MESSAGE_INITIALIZE: 0;
  declare export var CHILD_MESSAGE_CALL: 1;
  declare export var CHILD_MESSAGE_END: 2;

  declare export var PARENT_MESSAGE_OK: 0;
  declare export var PARENT_MESSAGE_CLIENT_ERROR: 1;
  declare export var PARENT_MESSAGE_SETUP_ERROR: 2;

  declare export type PARENT_MESSAGE_ERROR =
    | typeof PARENT_MESSAGE_CLIENT_ERROR
    | typeof PARENT_MESSAGE_SETUP_ERROR;

  declare export type WorkerPoolOptions = $ReadOnly<{
    setupArgs: $ReadOnlyArray<mixed>,
    forkOptions: child_process$forkOpts,
    maxRetries: number,
    numWorkers: number,
    enableWorkerThreads: boolean,
  }>;

  declare export type ChildMessageInitialize = [
    typeof CHILD_MESSAGE_INITIALIZE, // type
    boolean, // processed
    string, // file
    Array<mixed> | void, // setupArgs
    MessagePort | void, // MessagePort
  ];

  declare export type ChildMessageCall = [
    typeof CHILD_MESSAGE_CALL, // type
    boolean, // processed
    string, // method
    Array<mixed>, // args
  ];

  declare export type ChildMessageEnd = [
    typeof CHILD_MESSAGE_END, // type
    boolean, // processed
  ];

  declare export type ChildMessage =
    | ChildMessageInitialize
    | ChildMessageCall
    | ChildMessageEnd;

  declare export type ParentMessageOk = [
    typeof PARENT_MESSAGE_OK, // type
    mixed, // result
  ];

  declare export type ParentMessageError = [
    PARENT_MESSAGE_ERROR, // type
    string, // constructor
    string, // message
    string, // stack
    mixed, // extra
  ];

  declare export type ParentMessage = ParentMessageOk | ParentMessageError;

  declare export interface WorkerInterface {
    send(
      request: ChildMessage,
      onProcessStart: OnStart,
      onProcessEnd: OnEnd,
    ): void;
    getWorkerId(): number;
    getStderr(): stream$Readable | null;
    getStdout(): stream$Readable | null;
    onExit(exitCode: number): void;
    onMessage(message: ParentMessage): void;
  }

  declare export type OnStart = (worker: WorkerInterface) => void;
  declare export type OnEnd = (err: Error | null, result: mixed) => void;
  declare export interface WorkerPoolInterface {
    getStderr(): stream$Readable;
    getStdout(): stream$Readable;
    getWorkers(): Array<WorkerInterface>;
    createWorker(options: WorkerOptions): WorkerInterface;
    send(
      workerId: number,
      request: ChildMessage,
      onStart: OnStart,
      onEnd: OnEnd,
    ): void;
    end(): void;
  }

  declare export type FarmOptions<TSetupArgs: $ReadOnlyArray<mixed>> =
    $ReadOnly<{
      computeWorkerKey?: (
        method: string,
        ...args: $ReadOnlyArray<mixed>
      ) => string | null,
      exposedMethods?: $ReadOnlyArray<string>,
      forkOptions?: child_process$forkOpts,
      setupArgs?: TSetupArgs,
      maxRetries?: number,
      numWorkers?: number,
      WorkerPool?: (
        workerPath: string,
        options?: WorkerPoolOptions,
      ) => WorkerPoolInterface,
      enableWorkerThreads?: boolean,
    }>;

  declare export type IJestWorker<TExposed: {...} = {}> = $ReadOnly<{
    // dynamically exposed methods from the worker
    // $FlowFixMe[incompatible-exact]
    ...TExposed,

    getStderr: () => stream$Readable,
    getStdout: () => stream$Readable,
    end: () => Promise<void>,
  }>;

  declare export class Worker<
    TExposed: $ReadOnly<{
      [string]: (...Array<$FlowFixMe>) => Promise<$FlowFixMe>,
    }> = {},
    TSetupArgs: $ReadOnlyArray<mixed> = $ReadOnlyArray<mixed>,
  > {
    constructor(
      workerPath: string,
      options?: FarmOptions<TSetupArgs>,
    ): IJestWorker<TExposed>;

    getStderr(): stream$Readable;
    getStdout(): stream$Readable;
    end(): Promise<void>;
  }
}
