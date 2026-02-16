/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @format
 * @oncall react_native
 */

import type {Readable, Writable} from 'stream';
import type {ReadStream} from 'tty';

declare function main(
  argvInput?: Array<string>,
  $$PARAM_1$$?: Readonly<{
    stdin: Readable | ReadStream;
    stderr: Writable;
    stdout: Writable;
  }>,
): Promise<number>;
export default main;
