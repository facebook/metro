/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow strict-local
 * @format
 * @oncall react_native
 */

import {ESLint} from 'eslint';
import {
  translateFlowDefToTSDef,
  translateFlowToFlowDef,
} from 'flow-api-translator';
import fs from 'fs';
import glob from 'glob';
import nullthrows from 'nullthrows';
import path from 'path';
import * as prettier from 'prettier';
import util from 'util';

const WORKSPACE_ROOT = path.resolve(__dirname, '..');

const TYPES_DIR = 'types';

// Globs of paths for which we do not generate TypeScript definitions,
// matched against candidate .js files
const IGNORED_PATTERNS = [
  '**/__tests__/**',
  '**/__flowtests__/**',
  '**/__mocks__/**',
  '**/__fixtures__/**',
  '**/node_modules/**',
  'packages/metro-babel-register/**',
  'packages/metro/src/integration_tests/**',
];

export async function generateTsDefsForJsGlob(
  globPattern: string,
  opts: $ReadOnly<{
    verifyOnly: boolean,
  }> = {verifyOnly: false},
) {
  const linter = new ESLint({
    fix: true,
    cwd: WORKSPACE_ROOT,
  });

  const prettierConfig = await resolvePrettierConfig();

  const filesToProcess: Array<[jsFile: string, flowSourceFile: string]> =
    Array.from(
      glob
        .sync(globPattern, {
          ignore: IGNORED_PATTERNS,
          cwd: WORKSPACE_ROOT,
        })
        .reduce((toProcess, flowOrJsFile) => {
          if (flowOrJsFile.endsWith('.flow.js')) {
            // For .flow.js files, record the `.flow.js` as the source for the
            // corresponding `.js` file, which is enforced to be a transparent
            // entry file that only registers Babel and re-exports the module.
            toProcess.set(
              flowOrJsFile.replace(/\.flow\.js$/, '.js'),
              flowOrJsFile,
            );
          } else if (
            flowOrJsFile.endsWith('.js') &&
            !toProcess.has(flowOrJsFile)
          ) {
            toProcess.set(flowOrJsFile, flowOrJsFile);
          }
          return toProcess;
        }, new Map<string, string>())
        .entries(),
    );

  const errors = [];
  await Promise.all(
    filesToProcess.map(async ([jsFile, sourceFile]) => {
      const tsFile = getTSDeclPath(jsFile);
      const source = await fs.promises.readFile(sourceFile, 'utf-8');
      if (!source.includes('@flow')) {
        errors.push({
          sourceFile,
          error: new Error('Expected @flow directive'),
        });
        return;
      }
      try {
        const flowDef = await translateFlowToFlowDef(source);
        if (flowDef.includes('declare module.exports')) {
          errors.push({
            sourceFile,
            error: new Error(
              'module.exports is not supported by TypeScript auto-generation',
            ),
          });
        } else {
          const tsDef = await translateFlowDefToTSDef(flowDef);

          // Fix up gap left in license header by removal of atflow
          const beforeLint = tsDef.replace('\n *\n *\n', '\n *\n');

          const [lintResult] = await linter.lintText(beforeLint, {
            filePath: tsFile,
          });

          if (lintResult.messages.length > 0) {
            console.warn(lintResult.messages);
          }

          const finalOutput = await prettier.format(
            lintResult.output ?? beforeLint,
            prettierConfig,
          );

          if (opts.verifyOnly) {
            let existingFile = null;
            try {
              existingFile = await fs.promises.readFile(tsFile, 'utf-8');
              if (finalOutput !== existingFile) {
                errors.push({
                  sourceFile,
                  error: new Error('.d.ts file is out of sync'),
                });
              }
            } catch {
              errors.push({sourceFile, error: new Error('.d.ts file missing')});
            }
          } else {
            await fs.promises.mkdir(path.dirname(tsFile), {recursive: true});
            await fs.promises.writeFile(tsFile, finalOutput);
          }
        }
      } catch (error) {
        errors.push({sourceFile, error});
      }
    }),
  );

  return {
    success: errors.length === 0,
    errors,
  };
}

function getTSDeclPath(jsFilePath: string) {
  const parts = jsFilePath.split(path.sep);
  parts[2] = TYPES_DIR;
  const basename = nullthrows(parts.pop());
  parts.push(basename.slice(0, -3) + '.d.ts');
  return parts.join(path.sep);
}

async function resolvePrettierConfig() {
  const fakeTsDecl = path.resolve(__dirname, './dummy.d.ts');
  return {
    ...(await prettier.resolveConfig(fakeTsDecl)),
    filepath: fakeTsDecl,
  };
}

// When run as a script, execute pattern from argv
if (process.mainModule === module) {
  if (process.argv.length !== 3) {
    process.stderr.write(
      'Usage: yarn build-ts-experimental <glob>\n  Where <glob> matches .js ' +
        'files to process and is relative to the workspace root.\n',
    );
  } else {
    process.exitCode = 1;
    generateTsDefsForJsGlob(process.argv[2])
      .then(result => {
        if (result.success) {
          process.exitCode = 0;
        } else {
          util.inspect(result.errors);
        }
      })
      .catch(error => {
        util.inspect(error);
      });
  }
}
