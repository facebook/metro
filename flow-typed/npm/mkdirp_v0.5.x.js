/**
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow
 * @format
 */

declare module 'mkdirp' {
  declare type Options =
    | number
    | {
        mode?: number,
        fs?: mixed,
        ...
      };

  declare type Callback = (err: ?Error, path: ?string) => void;

  declare module.exports: {
    (path: string, options?: Options | Callback, callback?: Callback): void,
    sync(path: string, options?: Options): void,
    ...
  };
}
