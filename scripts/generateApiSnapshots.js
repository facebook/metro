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

'use strict';

import type {PackageResult} from './generateApiSnapshots.worker.js';

import {
  AUTO_GENERATED_PATTERNS,
  generateTsDefsForJsGlobs,
} from './generateTypeScriptDefinitions';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {Worker} from 'node:worker_threads';

const WORKSPACE_ROOT = path.resolve(__dirname, '..');
const PACKAGES_DIR = path.join(WORKSPACE_ROOT, 'packages');
const WORKER_PATH = path.join(__dirname, 'generateApiSnapshots.worker.js');

// Run the per-package worker for one package on its own thread. API Extractor
// is synchronous and CPU-bound (it builds a TypeScript program per entry
// point), so threads — not promises alone — are what actually overlap the work.
function processPackageInWorker(
  packageDir: string,
  tempFolder: string,
  verifyOnly: boolean,
): Promise<PackageResult> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(WORKER_PATH, {
      workerData: {
        packageDir,
        tempFolder,
        verifyOnly,
        workspaceRoot: WORKSPACE_ROOT,
      },
      // Clear `-r @babel/register`
      execArgv: [],
    });
    let result: ?PackageResult = null;
    worker.on('message', message => {
      result = message;
    });
    worker.on('error', reject);
    worker.on('exit', code => {
      if (code == 0 && result != null) {
        resolve(result);
      } else {
        reject(
          new Error(
            `Worker for ${path.basename(packageDir)} exited with code ${code} ` +
              (result == null ? 'without' : 'despite') +
              ' reporting a result',
          ),
        );
      }
    });
  });
}

export async function generateApiSnapshots(
  opts: Readonly<{verifyOnly: boolean}> = {verifyOnly: false},
): Promise<void> {
  const {verifyOnly} = opts;

  // The `.d.ts` files that feed API Extractor are build artifacts and are not
  // checked in. Regenerate them from the current Flow sources (always in write
  // mode, even when only verifying snapshots) so the extracted API reflects the
  // working tree. This is what lets a private-API change require no committed
  // output while a public-API change surfaces as a snapshot diff.
  await generateTsDefsForJsGlobs(AUTO_GENERATED_PATTERNS, {verifyOnly: false});

  const errors: Array<{context: string, error: Error}> = [];
  const allSkipped: Array<string> = [];
  let generatedCount = 0;

  const tempFolder = fs.mkdtempSync(
    path.join(os.tmpdir(), 'metro-api-snapshots-'),
  );

  try {
    const packageDirs = fs
      .readdirSync(PACKAGES_DIR)
      .map(name => path.join(PACKAGES_DIR, name))
      .filter(dir => fs.lstatSync(dir).isDirectory());

    const verb = verifyOnly ? 'verified' : 'generated';
    const results = await Promise.all(
      packageDirs.map(async packageDir => {
        const startTime = process.hrtime.bigint();
        try {
          const result = await processPackageInWorker(
            packageDir,
            tempFolder,
            verifyOnly,
          );
          // Report as each package lands, so slow packages are visible while the
          // rest are still in flight. Output order is completion order, not the
          // order of `packageDirs`.
          if (result.generatedCount > 0) {
            const elapsedMs =
              Number(process.hrtime.bigint() - startTime) / 1_000_000;
            process.stdout.write(
              `  ${path.basename(packageDir)}: ${result.generatedCount} ` +
                `snapshot(s) ${verb} in ${(elapsedMs / 1000).toFixed(1)}s\n`,
            );
          }
          return result;
        } catch (error) {
          return {
            errors: [{context: packageDir, error}],
            skipped: [],
            generatedCount: 0,
          } as PackageResult;
        }
      }),
    );

    for (const result of results) {
      errors.push(...result.errors);
      allSkipped.push(...result.skipped);
      generatedCount += result.generatedCount;
    }
  } finally {
    fs.rmSync(tempFolder, {recursive: true, force: true});
  }

  if (allSkipped.length > 0) {
    console.warn(
      'Skipped public entry points without generated TypeScript ' +
        `definitions:\n  ${allSkipped.join('\n  ')}`,
    );
  }

  const verb = verifyOnly ? 'Verified' : 'Generated';
  process.stdout.write(
    `${verb} ${generatedCount} public API snapshot(s) across Metro's OSS ` +
      'packages.\n',
  );

  if (errors.length > 0) {
    errors.sort((a, b) => a.context.localeCompare(b.context));
    throw new AggregateError(
      errors.map(({context, error}) => {
        error.message = `${context}: ${error.message}`;
        return error;
      }),
      'Errors encountered while generating public API snapshots',
    );
  }
}

// When run as a script, generate (or, with --verify, verify) all snapshots.
if (require.main === module) {
  const verifyOnly = process.argv.includes('--verify');
  generateApiSnapshots({verifyOnly}).catch(error => {
    process.exitCode = 1;
    console.error(error);
  });
}
