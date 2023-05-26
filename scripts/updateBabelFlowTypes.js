/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @format
 * @oncall react_native
 * @flow
 */

/**
 * This script updates all flow types. Run it every time you upgrade babel
 */

import {execSync} from 'child_process';
import fs from 'fs';
import * as prettier from 'prettier';

async function main() {
  const babelTraverseScriptPath = require.resolve('./updateBabelTraverseTypes');
  const babelTraverseFlowDefinitionPath = require.resolve(
    '../flow-typed/babel-traverse.js',
  );

  const babelRegisterPath = require.resolve('../../babel-register.js');

  execSync(
    `node ${babelRegisterPath} ${babelTraverseScriptPath} ${babelTraverseFlowDefinitionPath}`,
  );
  await formatWithPrettier(babelTraverseFlowDefinitionPath);

  const babelTypesScriptPath = require.resolve('./updateBabelTypesFlowTypes');
  const babelTypesFlowDefinitionPath = require.resolve(
    '../flow-typed/babel-types.js.flow',
  );

  execSync(
    `node ${babelRegisterPath} ${babelTypesScriptPath} > ${babelTypesFlowDefinitionPath}`,
  );

  await formatWithPrettier(babelTypesFlowDefinitionPath);
}

async function formatWithPrettier(fileName: string) {
  const config = await prettier.resolveConfig(fileName);
  fs.writeFileSync(
    fileName,
    prettier.format(fs.readFileSync(fileName, 'utf-8'), {
      ...config,
      filepath: fileName,
    }),
  );
}

main().catch(error => console.error(error));
