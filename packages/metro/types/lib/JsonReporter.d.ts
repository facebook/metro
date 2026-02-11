/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @format
 * @oncall react_native
 */

import type {Writable} from 'stream';

export type SerializedError = {
  message: string;
  stack: string;
  errors?: ReadonlyArray<SerializedError>;
  cause?: SerializedError;
};
export type SerializedEvent<
  TEvent extends {readonly [$$Key$$: string]: unknown},
> = TEvent extends {error: Error}
  ? Omit<Omit<TEvent, 'error'>, keyof {error: SerializedError}> & {
      error: SerializedError;
    }
  : TEvent;
declare class JsonReporter<
  TEvent extends {readonly [$$Key$$: string]: unknown},
> {
  _stream: Writable;
  constructor(stream: Writable);
  /**
   * There is a special case for errors because they have non-enumerable fields.
   * (Perhaps we should switch in favor of plain object?)
   */
  update(event: TEvent): void;
}
export default JsonReporter;
