/**
 * (c) Meta Platforms, Inc. and affiliates. Confidential and proprietary.
 *
 * @flow strict-local
 * @format
 * @oncall code_indexing
 */

// $FlowFixMe[unsupported-syntax]
declare module 'strip-ansi' {
  declare module.exports: (string: string) => string;
}

// $FlowFixMe[unsupported-syntax]
declare module 'strip-ansi' {
  declare export default function stripAnsi(string: string): string;
}
