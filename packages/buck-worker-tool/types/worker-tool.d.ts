/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @format
 * @oncall react_native
 */

import type {Duplex} from 'stream';

import {Console} from 'console';

export type Command = (
  argv: Array<string>,
  structuredArgs: unknown,
  console: Console,
) => Promise<void> | void;
export type Commands = {[key: string]: Command};
declare function buckWorker(commands: Commands): Duplex;
export {buckWorker};
