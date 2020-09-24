/**
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @format
 */

'use strict';

const generate = require('@babel/generator').default;
const {toMatchSnapshot} = require('jest-snapshot');

const generateOptions = {concise: true, sourceType: 'module'};
const codeFromAst = ast => generate(ast, generateOptions).code;
const comparableCode = code => code.trim().replace(/\s+/g, ' ');

function toEqualComparableCode(received, expected) {
  const comparableExpected = comparableCode(expected);

  const pass = received === comparableExpected;

  const options = {
    isNot: this.isNot,
    promise: this.promise,
  };

  const message = pass
    ? () =>
        this.utils.matcherHint(
          'toEqualComparableCode',
          undefined,
          undefined,
          options,
        ) +
        '\n\n' +
        `Expected: not ${this.utils.printExpected(comparableExpected)}\n` +
        `Received: ${this.utils.printReceived(received)}`
    : () => {
        const diffString = this.utils.printDiffOrStringify(
          comparableExpected,
          received,
          'expected',
          'received',
          this.expand,
        );
        return (
          this.utils.matcherHint(
            'toEqualComparableCode',
            undefined,
            undefined,
            options,
          ) +
          '\n\n' +
          diffString
        );
      };

  return {actual: received, message, pass};
}

// See https://superuser.com/questions/380772/removing-ansi-color-codes-from-text-stream
const ANSI_PATTERN = /\x1b\[[0-9;]*m/g;

function trimANSICodes(input) {
  return input.replace(ANSI_PATTERN, '');
}

/**
 * Matches a text that contains ANSI control codes (e.g. [39m[31m[1m^) against a snapshot.
 * Usage: Call expect.extend({toMatchCodeFrameSnapshot}) to add the matcher in your test
 */
function toMatchCodeFrameSnapshot(received) {
  return toMatchSnapshot.call(
    this,
    trimANSICodes(received),
    'toMatchCodeFrameSnapshot',
  );
}

module.exports = {
  codeFromAst,
  comparableCode,
  toEqualComparableCode,
  toMatchCodeFrameSnapshot,
};
