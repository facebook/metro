/**
 * Copyright (c) 2016-present, Facebook, Inc.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @format
 */
'use strict';

const stub = require('sinon/lib/sinon/stub');

const generate = require('@babel/generator').default;

exports.fn = () => {
  const s = stub();
  const f = jest.fn(s);
  f.stub = s;
  return f;
};

const generateOptions = {concise: true, sourceType: 'module'};
exports.codeFromAst = ast => generate(ast, generateOptions).code;
exports.comparableCode = code => code.trim().replace(/\s+/g, ' ');
