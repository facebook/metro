/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow
 * @format
 * @oncall react_native
 */

'use strict';

import type {Writable} from 'stream';

export type SerializedError = {
  message: string,
  stack: string,
  errors?: $ReadOnlyArray<SerializedError>,
  cause?: SerializedError,
  ...
};

export type SerializedEvent<TEvent: {[string]: any, ...}> = TEvent extends {
  error: Error,
  ...
}
  ? {
      ...Omit<TEvent, 'error'>,
      error: SerializedError,
      ...
    }
  : TEvent;

class JsonReporter<TEvent: {[string]: any, ...}> {
  _stream: Writable;

  constructor(stream: Writable) {
    this._stream = stream;
  }

  /**
   * There is a special case for errors because they have non-enumerable fields.
   * (Perhaps we should switch in favor of plain object?)
   */
  update(event: TEvent): void {
    if (event.error instanceof Error) {
      const {message, stack} = event.error;
      // $FlowFixMe[unsafe-object-assign]
      event = Object.assign(event, {
        error: serializeError(event.error),
        // TODO: Preexisting issue - this writes message, stack, etc. as
        // top-level siblings of event.error (which was serialized to {}), whereas it was presumably
        // intended to nest them _under_ error. Fix this in a breaking change.
        message,
        stack,
      });
    }
    this._stream.write(JSON.stringify(event) + '\n');
  }
}

function serializeError(
  e: Error,
  seen: Set<Error> = new Set(),
): SerializedError {
  if (seen.has(e)) {
    return {message: '[circular]: ' + e.message, stack: e.stack};
  }
  seen.add(e);
  const {message, stack, cause} = e;
  const serialized: SerializedError = {message, stack};
  if (e instanceof AggregateError) {
    serialized.errors = [...e.errors]
      .map(innerError =>
        innerError instanceof Error ? serializeError(innerError, seen) : null,
      )
      .filter(Boolean);
  }
  if (cause instanceof Error) {
    serialized.cause = serializeError(cause, seen);
  }
  return serialized;
}

module.exports = JsonReporter;
