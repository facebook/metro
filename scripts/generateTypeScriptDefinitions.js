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

// $FlowFixMe[untyped-import] in OSS only
import {ESLint} from 'eslint';
import {
  translateFlowDefToTSDef,
  translateFlowToFlowDef,
} from 'flow-api-translator';
import fs from 'fs';
// $FlowFixMe[untyped-import] in OSS only
import glob from 'glob';
import nullthrows from 'nullthrows';
import path from 'path';
import * as prettier from 'prettier';

const WORKSPACE_ROOT = path.resolve(__dirname, '..');

const TYPES_DIR = 'types';

export const AUTO_GENERATED_PATTERNS: $ReadOnlyArray<string> = [
  // TODO: Add globs
];

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

export async function generateTsDefsForJsGlobs(
  globPattern: string | $ReadOnlyArray<string>,
  opts: $ReadOnly<{
    verifyOnly: boolean,
  }> = {verifyOnly: false},
) {
  const linter = new ESLint({
    fix: true,
    cwd: WORKSPACE_ROOT,
  });

  const prettierConfig = await resolvePrettierConfig();

  const globPatterns = Array.isArray(globPattern) ? globPattern : [globPattern];

  const existingDefs = new Set<string>();
  const filesToProcess: Array<[jsFile: string, flowSourceFile: string]> =
    Array.from(
      globPatterns
        .flatMap(pattern =>
          glob.sync(pattern, {
            ignore: IGNORED_PATTERNS,
            cwd: WORKSPACE_ROOT,
          }),
        )
        .reduce((toProcess, filePath) => {
          if (filePath.endsWith('.flow.js')) {
            // For .flow.js files, record the `.flow.js` as the source for the
            // corresponding `.js` file, which is enforced to be a transparent
            // entry file that only registers Babel and re-exports the module.
            toProcess.set(filePath.replace(/\.flow\.js$/, '.js'), filePath);
          } else if (filePath.endsWith('.js') && !toProcess.has(filePath)) {
            toProcess.set(filePath, filePath);
          } else if (
            filePath.endsWith('.d.ts') &&
            filePath.split(path.sep)[2] === TYPES_DIR
          ) {
            existingDefs.add(path.resolve(WORKSPACE_ROOT, filePath));
          }
          return toProcess;
        }, new Map<string, string>())
        .entries(),
    );

  const errors = [];
  await Promise.all(
    filesToProcess.map(async ([jsFile, sourceFile]) => {
      const absoluteTsFile = getTSDeclAbsolutePath(jsFile);
      const absoluteSourceFile = path.resolve(WORKSPACE_ROOT, sourceFile);
      const source = await fs.promises.readFile(absoluteSourceFile, 'utf-8');
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
            filePath: absoluteTsFile,
          });

          if (lintResult.messages.length > 0) {
            console.warn(sourceFile, lintResult.messages);
          }

          const finalOutput = await prettier.format(
            lintResult.output ?? beforeLint,
            prettierConfig,
          );

          existingDefs.delete(absoluteTsFile);

          if (opts.verifyOnly) {
            let existingFile = null;
            try {
              existingFile = await fs.promises.readFile(
                absoluteTsFile,
                'utf-8',
              );
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
            await fs.promises.mkdir(path.dirname(absoluteTsFile), {
              recursive: true,
            });
            await fs.promises.writeFile(absoluteTsFile, finalOutput);
          }
        }
      } catch (error) {
        errors.push({sourceFile, error});
      }
    }),
  );

  if (existingDefs.size > 0) {
    const orphanedDefs = Array.from(existingDefs);
    if (opts.verifyOnly) {
      orphanedDefs.forEach(sourceFile => {
        errors.push({
          error: new Error('.d.ts appears to be orphaned'),
          sourceFile,
        });
      });
    } else {
      // Delete .d.ts files under a generated location that were not generated.
      await Promise.all(
        orphanedDefs.map(sourceFile => fs.promises.unlink(sourceFile)),
      );
    }
  }

  if (errors.length > 0) {
    errors.sort((a, b) => a.sourceFile.localeCompare(b.sourceFile));
    throw new AggregateError(
      errors,
      'Errors encountered while generating TypeScript definitions',
    );
  }
}

function getTSDeclAbsolutePath(jsRelativePath: string) {
  const parts = jsRelativePath.split(path.sep);
  if (parts[2] !== 'src') {
    throw new Error(
      'Expected relative path of the form packages/<pkg>/src/...',
    );
  }
  parts[2] = TYPES_DIR;
  const basename = nullthrows(parts.pop());
  parts.push(basename.slice(0, -3) + '.d.ts');
  return path.resolve(WORKSPACE_ROOT, parts.join(path.sep));
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
  // Usage: node scripts/generateTypeScriptDefinitions.js [glob...]
  // Omit globs to use hardcoded defaults.
  generateTsDefsForJsGlobs(
    process.argv.length >= 3 ? process.argv.slice(2) : AUTO_GENERATED_PATTERNS,
  ).catch(error => {
    process.exitCode = 1;
    console.error(error);
  });
}
