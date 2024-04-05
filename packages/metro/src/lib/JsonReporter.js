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

export type SerializedEvent<TEvent: {[string]: any, ...}> = TEvent extends {
  error: Error,
  ...
}
  ? {
      ...Omit<TEvent, 'error'>,
      message: string,
      stack: string,
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
    // $FlowFixMe[method-unbinding] added when improving typing for this parameters
    if (Object.prototype.toString.call(event.error) === '[object Error]') {
      event = Object.assign(event, {
        message: event.error.message,
        stack: event.error.stack,
      });
    }

    this._stream.write(JSON.stringify(event) + '\n');
  }
}

module.exports = JsonReporter;
