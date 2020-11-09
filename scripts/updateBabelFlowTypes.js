/**
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @format
 */

/**
 * This script updates all flow types. Run it every time you upgrade babel
 */

'use strict';

const fs = require('fs');
const prettier = require('prettier');

const {execSync} = require('child_process');

async function main() {
  const babelTraverseScriptPath = require.resolve('./updateBabelTraverseTypes');
  const babelTraverseFlowDefinitionPath = require.resolve(
    '../flow-typed/babel-traverse.js',
  );

  execSync(
    `node ${babelTraverseScriptPath} ${babelTraverseFlowDefinitionPath}`,
  );
  await formatWithPrettier(babelTraverseFlowDefinitionPath);

  const babelTypesScriptPath = require.resolve('./updateBabelTypesFlowTypes');
  const babelTypesFlowDefinitionPath = require.resolve(
    '../flow-typed/babel-types.js.flow',
  );

  execSync(`node ${babelTypesScriptPath} > ${babelTypesFlowDefinitionPath}`);

  await formatWithPrettier(babelTypesFlowDefinitionPath);
}

async function formatWithPrettier(fileName) {
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
