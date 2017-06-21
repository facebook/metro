/**
 * Copyright (c) 2016-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 *
 * @flow
 */
'use strict';

import type {Module} from '../types.flow';

function dependenciesDot({modules}: {+modules: Iterable<Module>}) {
  const list = [];

  // Opening digraph.
  list.push('digraph {');

  // Adding each module -> dependency.
  for (const module of modules) {
    const file = JSON.stringify(module.file.path);

    module.dependencies.forEach(dependency => {
      list.push(`\t${file} -> ${JSON.stringify(dependency.path)};`);
    });
  }

  // Closing digraph.
  list.push('}');

  return list.join('\n');
}

module.exports = dependenciesDot;
