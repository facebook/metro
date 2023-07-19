/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @format
 * @flow
 * @oncall react_native
 */

/**
 * This script updates all flow types. Run it every time you upgrade babel
 */

import {promises as fsPromises} from 'fs';
import generateBabelFlowLibraryDefinitions from './support/generateBabelFlowLibraryDefinitions';

async function main() {
  const newContentByFile = await generateBabelFlowLibraryDefinitions();
  await Promise.all(
    Array.from(newContentByFile.entries(), ([path, content]) =>
      fsPromises.writeFile(path, content),
    ),
  );
}

main().catch(error => console.error(error));
