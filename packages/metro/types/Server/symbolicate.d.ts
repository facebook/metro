/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @format
 * @oncall react_native
 */

import type {ExplodedSourceMap} from '../DeltaBundler/Serializers/getExplodedSourceMap';
import type {ConfigT} from 'metro-config';

export type StackFrameInput = {
  readonly file: null | undefined | string;
  readonly lineNumber: null | undefined | number;
  readonly column: null | undefined | number;
  readonly methodName: null | undefined | string;
};
export type IntermediateStackFrame = Omit<
  StackFrameInput,
  keyof {collapse?: boolean}
> & {collapse?: boolean};
export type StackFrameOutput = Readonly<IntermediateStackFrame>;
declare function symbolicate(
  stack: ReadonlyArray<StackFrameInput>,
  maps: Iterable<[string, ExplodedSourceMap]>,
  config: ConfigT,
  extraData: unknown,
): Promise<ReadonlyArray<StackFrameOutput>>;
export default symbolicate;
