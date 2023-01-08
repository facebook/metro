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

import type {Module} from '../../types.flow';
import type {BytecodeOutput} from 'metro-transform-worker';

import type {Options} from './js';
const {getModuleParams} = require('./js');

const invariant = require('invariant');

function wrapModule(module: Module<>, options: Options): Array<Buffer> {
  const output = getBytecodeOutput(module);

  if (output.type.startsWith('bytecode/script')) {
    return [output.data.bytecode];
  }

  const params = getModuleParams(module, options);
  const {compile} = require('metro-hermes-compiler');

  const headerCode = `globalThis.$$METRO_D=[${JSON.stringify(params)}];`;
  return [
    compile(headerCode, {
      sourceURL: module.path + '-virtual.js',
    }).bytecode,
    output.data.bytecode,
  ];
}

function getBytecodeOutput(module: Module<>): BytecodeOutput {
  const output = module.output
    .filter(({type}) => type.startsWith('bytecode/'))
    .map((output: any) =>
      output.data.bytecode instanceof Buffer
        ? output
        : // Re-create buffers after losing the Buffer instance when sending data over workers.
          {
            ...output,
            data: {
              ...output.data,
              bytecode: Buffer.from(output.data.bytecode.data),
            },
          },
    );

  invariant(
    output.length === 1,
    `Modules must have exactly one bytecode output, but ${module.path} has ${output.length} bytecode outputs.`,
  );

  return (output[0]: any);
}

function isBytecodeModule(module: Module<>): boolean {
  return (
    module.output.filter(({type}) => type.startsWith('bytecode/')).length > 0
  );
}

module.exports = {
  getBytecodeOutput,
  isBytecodeModule,
  wrapModule,
};
