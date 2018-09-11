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

const {Writable} = require('stream');

class JsonReporter<TEvent: {}> {
  _stream: Writable;

  constructor(stream: Writable) {
    this._stream = stream;
  }

  /**
   * There is a special case for errors because they have non-enumerable fields.
   * (Perhaps we should switch in favor of plain object?)
   */
  update(event: TEvent) {
    /* $FlowFixMe: fine to call on `undefined`. */
    if (Object.prototype.toString.call(event.error) === '[object Error]') {
      event = {...event};
      /* $FlowFixMe(>=0.70.0 site=react_native_fb) This comment suppresses an
       * error found when Flow v0.70 was deployed. To see the error delete
       * this comment and run Flow. */
      event.error = {
        /* $FlowFixMe(>=0.70.0 site=react_native_fb) This comment suppresses an
         * error found when Flow v0.70 was deployed. To see the error delete
         * this comment and run Flow. */
        ...event.error,
        /* $FlowFixMe(>=0.70.0 site=react_native_fb) This comment suppresses an
         * error found when Flow v0.70 was deployed. To see the error delete
         * this comment and run Flow. */
        message: event.error.message,
        /* $FlowFixMe(>=0.70.0 site=react_native_fb) This comment suppresses an
         * error found when Flow v0.70 was deployed. To see the error delete
         * this comment and run Flow. */
        stack: event.error.stack,
      };
    }
    this._stream.write(JSON.stringify(event) + '\n');
  }
}

module.exports = JsonReporter;
