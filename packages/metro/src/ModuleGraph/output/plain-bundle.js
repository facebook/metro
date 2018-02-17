/**
 * Copyright (c) 2016-present, Facebook, Inc.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow
 * @format
 */

'use strict';

const meta = require('../../shared/output/meta');

const {getModuleCode, concat} = require('./util');
const {createIndexMap} = require('metro-source-map');

import type {OutputFn} from '../types.flow';

function asPlainBundle({
  filename,
  idsForPath,
  modules,
  requireCalls,
  sourceMapPath,
}) {
  let code = '';
  let line = 0;
  const sections = [];
  const modIdForPath = x => idsForPath(x).moduleId;

  for (const module of concat(modules, requireCalls)) {
    const {file} = module;
    const moduleCode = getModuleCode(module, modIdForPath);

    code += moduleCode + '\n';
    if (file.map) {
      sections.push({
        map: file.map,
        offset: {column: 0, line},
      });
    }
    line += countLines(moduleCode);
  }

  if (sourceMapPath) {
    code += `//# sourceMappingURL=${sourceMapPath}`;
  }

  return {
    code,
    extraFiles: [[`${filename}.meta`, meta(code)]],
    map: createIndexMap(filename, sections),
  };
}

module.exports = (asPlainBundle: OutputFn<>);

const reLine = /^/gm;
function countLines(string: string): number {
  //$FlowFixMe This regular expression always matches
  return string.match(reLine).length;
}
