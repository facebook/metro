/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow strict-local
 * @format
 */

// Translated manually from TS: https://github.com/southpolesteve/node-abort-controller/blob/10e0cea66a069d9319f948d055621e1d37aea5db/index.d.ts

// `AbortSignal`,`AbortController` are defined here to prevent a dependency on the `dom` library which disagrees with node runtime.
// The definition for `AbortSignal` is taken from @types/node-fetch (https://github.com/DefinitelyTyped/DefinitelyTyped) for
// maximal compatibility with node-fetch.
// Original node-fetch definitions are under MIT License.

declare module 'node-abort-controller' {
  declare export class AbortSignal {
    aborted: boolean;
    reason?: any;

    addEventListener: (
      type: 'abort',
      listener: (this: AbortSignal, event: any) => any,
      options?:
        | boolean
        | {
            capture?: boolean,
            once?: boolean,
            passive?: boolean,
          },
    ) => void;

    removeEventListener: (
      type: 'abort',
      listener: (this: AbortSignal, event: any) => any,
      options?:
        | boolean
        | {
            capture?: boolean,
          },
    ) => void;

    dispatchEvent: (event: any) => boolean;

    onabort: null | ((this: AbortSignal, event: any) => void);

    throwIfAborted(): void;

    static abort(reason?: any): AbortSignal;

    static timeout(time: number): AbortSignal;
  }

  declare export class AbortController {
    signal: AbortSignal;

    abort(reason?: any): void;
  }
}
