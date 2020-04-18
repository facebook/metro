/**
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow strict-local
 * @format
 */

'use strict';

const hermesc = require('./emhermesc.js')({
  noInitialRun: true,
  noExitRuntime: true,
  // Do not call console methods
  print: () => {},
  printErr: () => {},
});

export type Options = {|
  sourceURL: string,
  moduleID?: ?number,
|};

export type HermesCompilerResult = $ReadOnly<{|
  bytecode: Buffer,
  sourcemap: Buffer,
|}>;

const compileToBytecode = hermesc.cwrap(
  'hermesCompileToBytecode',
  'number',
  ['number', 'number', 'string'],
  'number',
);
const getError = hermesc.cwrap('hermesCompileResult_getError', 'string', [
  'number',
]);
const getBytecodeAddr = hermesc.cwrap(
  'hermesCompileResult_getBytecodeAddr',
  'number',
  ['number'],
);
const getBytecodeSize = hermesc.cwrap(
  'hermesCompileResult_getBytecodeSize',
  'number',
  ['number'],
);
const getSourcemapAddr = hermesc.cwrap(
  'hermesCompileResult_getSourcemapAddr',
  'number',
  ['number'],
);
const getSourcemapSize = hermesc.cwrap(
  'hermesCompileResult_getSourcemapSize',
  'number',
  ['number'],
);
const free = hermesc.cwrap('hermesCompileResult_free', 'void', ['number']);

module.exports = function(
  source: string | Buffer,
  {sourceURL, moduleID}: Options,
): HermesCompilerResult {
  const buffer =
    typeof source === 'string' ? Buffer.from(source, 'utf8') : source;

  const address = hermesc._malloc(buffer.length + 1);
  if (!address) {
    throw new Error('Hermesc is out of memory.');
  }

  try {
    hermesc.HEAP8.set(buffer, address);
    hermesc.HEAP8[address + buffer.length] = 0;
    const result = compileToBytecode(
      address,
      buffer.length + 1,
      sourceURL,
      moduleID || 0,
    );

    try {
      const error = getError(result);
      if (error) {
        throw new Error(error);
      }
      return {
        bytecode: Buffer.from(
          Buffer.from(
            hermesc.HEAP8.buffer,
            getBytecodeAddr(result),
            getBytecodeSize(result),
          ),
        ),
        sourcemap: Buffer.from(
          Buffer.from(
            hermesc.HEAP8.buffer,
            getSourcemapAddr(result),
            getSourcemapSize(result),
          ),
        ),
      };
    } finally {
      free(result);
    }
  } finally {
    hermesc._free(address);
  }
};
