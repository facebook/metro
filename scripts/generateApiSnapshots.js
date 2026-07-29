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

import {
  AUTO_GENERATED_PATTERNS,
  generateTsDefsForJsGlobs,
} from './generateTypeScriptDefinitions';
import {Extractor, ExtractorConfig} from '@microsoft/api-extractor';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const WORKSPACE_ROOT = path.resolve(__dirname, '..');
const PACKAGES_DIR = path.join(WORKSPACE_ROOT, 'packages');
// Extraction-only tsconfig (adds the "dom" lib on top of the project config).
const TSCONFIG_PATH = path.join(WORKSPACE_ROOT, 'tsconfig.api-extractor.json');

// Committed public API snapshot file, written at each package's root. One
// report is generated per public entry point.
const SNAPSHOT_FILENAME = 'API.md';

// package.json exports subpaths that never describe a public, type-generated
// entry point and are therefore excluded from snapshotting.
const NON_API_EXPORT_KEYS = new Set(['./package.json']);

// A package.json `exports` field: either a single module path, or a map of
// subpath to target. Targets are untyped in package.json, so they're modelled
// as `mixed` and narrowed at read time (see `resolveExportTarget`).
type ExportsMap = {readonly [subpath: string]: unknown, ...};
type ExportsField = string | ExportsMap;

type EntryPoint = {
  // Committed snapshot file name, relative to the package root (e.g.
  // `API.md`).
  outputFileName: string,
  // Scratch report file name handed to API Extractor (e.g.
  // `metro-core.api.md`), unique per entry point so reports can share one
  // temp folder.
  tempReportFileName: string,
  // Absolute path to the generated `.d.ts` for this entry point.
  dtsPath: string,
  // The exports subpath this entry point corresponds to, for diagnostics.
  exportKey: string,
};

function readJson(filePath: string): {[string]: unknown, ...} {
  return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
}

function unscopedName(packageName: string): string {
  return packageName.replace(/^@[^/]+\//, '');
}

// Resolve the exports target for a subpath to a single module path string,
// unwrapping conditional exports (picking a plain "." / "default" / first).
function resolveExportTarget(value: unknown): ?string {
  if (typeof value === 'string') {
    return value;
  }
  if (value == null || typeof value !== 'object') {
    return null;
  }
  const resolved =
    value.import ?? value.default ?? value.require ?? Object.values(value)[0];
  return typeof resolved === 'string' ? resolved : null;
}

// Whether a `.d.ts` declares any exports. API Extractor treats a declaration
// file with no exports as a non-module and errors out, so such entry points
// (e.g. CLI-only packages) are skipped rather than snapshotted.
function hasExports(dtsPath: string): boolean {
  const source = fs.readFileSync(dtsPath, 'utf-8');
  return /^\s*export[\s{*=]/m.test(source);
}

// Map a `./src/<rel>.js` exports target to its generated `types/<rel>.d.ts`.
function sourceTargetToDts(packageDir: string, target: string): ?string {
  const match = /^\.\/src\/(.+)\.js$/.exec(target);
  if (match == null) {
    return null;
  }
  return path.join(packageDir, 'types', match[1] + '.d.ts');
}

// Committed snapshot file name for an entry point, written at the package
// root. The main entry is `API.md`; secondary subpaths are suffixed, e.g.
// `API-<subpath>.md`.
function outputFileNameFor(exportKey: string): string {
  if (exportKey === '.') {
    return SNAPSHOT_FILENAME;
  }
  const suffix = exportKey.replace(/^\.\//, '').replace(/\//g, '-');
  return `API-${suffix}.md`;
}

// Unique scratch report name handed to API Extractor, derived from the package
// name and exports subpath so all reports can share a single temp folder.
function tempReportFileNameFor(packageName: string, exportKey: string): string {
  const base = unscopedName(packageName);
  if (exportKey === '.') {
    return `${base}.api.md`;
  }
  const suffix = exportKey.replace(/^\.\//, '').replace(/\//g, '-');
  return `${base}-${suffix}.api.md`;
}

// Collect the public entry points for a package from its `exports` field.
// Wildcard, `./package.json`, and non-`./src/*.js` targets are excluded, as
// are entry points whose `.d.ts` has not been generated (e.g. runtime-only
// modules) — those are returned separately as `skipped`.
function collectEntryPoints(
  packageDir: string,
  packageJson: {[string]: unknown, ...},
): {entryPoints: Array<EntryPoint>, skipped: Array<string>} {
  const packageName = String(packageJson.name);
  // `packageJson.exports` is typed as `unknown`; narrow with `typeof` before
  // casting so the shape is validated at runtime rather than waved through.
  const rawExports = packageJson.exports;
  const exportsField: ?ExportsField =
    typeof rawExports === 'string'
      ? rawExports
      : typeof rawExports === 'object' && rawExports != null
        ? (rawExports as ExportsMap)
        : null;
  const entryPoints: Array<EntryPoint> = [];
  const skipped: Array<string> = [];

  if (exportsField == null) {
    return {entryPoints, skipped};
  }

  const entries: Array<[string, unknown]> =
    typeof exportsField === 'string'
      ? [['.', exportsField]]
      : Object.entries(exportsField);

  for (const [exportKey, rawValue] of entries) {
    if (NON_API_EXPORT_KEYS.has(exportKey) || exportKey.includes('*')) {
      continue;
    }
    const target = resolveExportTarget(rawValue);
    if (target == null) {
      continue;
    }
    const dtsPath = sourceTargetToDts(packageDir, target);
    if (dtsPath == null) {
      // A public entry point whose target isn't a `./src/<rel>.js` module (e.g.
      // `./src/foo.mjs`, `./lib/foo.js`, or a bare specifier), so we can't map
      // it to a generated `.d.ts`. Record it so misconfigured exports surface
      // in the summary rather than being silently dropped.
      skipped.push(
        `${packageName} "${exportKey}" (unsupported exports target "${target}")`,
      );
      continue;
    }
    if (!fs.existsSync(dtsPath)) {
      // A public entry point without generated types (e.g. metro-runtime's
      // runtime-only modules). Record it so the summary can surface it.
      skipped.push(
        `${packageName} "${exportKey}" (no ${path.relative(WORKSPACE_ROOT, dtsPath)})`,
      );
      continue;
    }
    if (!hasExports(dtsPath)) {
      // A public entry point with no exported API surface (e.g. a CLI-only
      // package). There is nothing to snapshot.
      skipped.push(`${packageName} "${exportKey}" (no exported API surface)`);
      continue;
    }
    entryPoints.push({
      outputFileName: outputFileNameFor(exportKey),
      tempReportFileName: tempReportFileNameFor(packageName, exportKey),
      dtsPath,
      exportKey,
    });
  }

  return {entryPoints, skipped};
}

// Post-process an API Extractor report into a committed snapshot. API Extractor
// tags every export with a release tag and flags the absence of TSDoc, but
// Metro's public surface is documented by its Flow types rather than TSDoc, so
// those annotations are pure noise. There is no config option to suppress them
// (they are hardcoded in API Extractor's ApiReportGenerator), so we strip them
// here: `(undocumented)` markers, the release-tag comment lines (`// @public`
// etc.), and the missing-`@packageDocumentation` notice, then collapse the
// blank lines left behind.
function cleanReport(report: string): string {
  const result: Array<string> = [];
  for (const raw of report.split('\n')) {
    const rawTrimmed = raw.trim();
    // Drop standalone `(undocumented)` markers and the missing-packageDoc
    // notice entirely. (Checked before the inline strip below, which would
    // otherwise reduce `// (undocumented)` to a bare `//`.)
    if (
      rawTrimmed === '// (undocumented)' ||
      rawTrimmed === '// (No @packageDocumentation comment for this package)'
    ) {
      continue;
    }

    // Normalize inline `(undocumented)` suffixes (e.g. `// @public
    // (undocumented)` becomes `// @public`).
    let line = raw.replace(/ \(undocumented\)/g, '');

    // Strip the release-tag token from AEDoc comment lines, preserving any
    // other modifiers (e.g. `// @public @deprecated` becomes `// @deprecated`).
    const tagMatch = line.match(
      /^(\s*)\/\/ @(?:public|beta|alpha|internal)\b ?(.*)$/,
    );
    if (tagMatch != null) {
      const rest = tagMatch[2].trim();
      if (rest === '') {
        // Nothing but the release tag — drop the whole comment line.
        continue;
      }
      line = `${tagMatch[1]}// ${rest}`;
    }

    // Collapse runs of blank lines left by the removals above.
    if (line.trim() === '' && result[result.length - 1]?.trim() === '') {
      continue;
    }
    result.push(line);
  }
  return result.join('\n');
}

// Run API Extractor for a single entry point and return its report text. The
// report is written to (and read back from) a scratch folder; the caller owns
// writing it to its committed location so we control the file name, path, and
// post-processing.
function runExtractor(
  packageDir: string,
  packageJsonPath: string,
  entryPoint: EntryPoint,
  tempFolder: string,
): {succeeded: boolean, report: string} {
  const configObject = {
    projectFolder: packageDir,
    mainEntryPointFilePath: entryPoint.dtsPath,
    // Emit unix line endings to match repo conventions.
    newlineKind: 'lf',
    compiler: {tsconfigFilePath: TSCONFIG_PATH},
    apiReport: {
      enabled: true,
      reportFolder: tempFolder,
      reportFileName: entryPoint.tempReportFileName,
      reportTempFolder: tempFolder,
    },
    docModel: {enabled: false},
    dtsRollup: {enabled: false},
    tsdocMetadata: {enabled: false},
    // Keep snapshots focused on the API surface, not on lint-style advice.
    messages: {
      extractorMessageReporting: {
        default: {logLevel: 'none', addToApiReportFile: false},
      },
      compilerMessageReporting: {default: {logLevel: 'none'}},
      tsdocMessageReporting: {default: {logLevel: 'none'}},
    },
  };

  const extractorConfig = ExtractorConfig.prepare({
    configObject,
    configObjectFullPath: path.join(packageDir, 'api-extractor.json'),
    packageJsonFullPath: packageJsonPath,
  });

  // Always write to the scratch folder (localBuild); the caller diffs/commits
  // the result itself.
  const result = Extractor.invoke(extractorConfig, {
    localBuild: true,
    showVerboseMessages: false,
    showDiagnostics: false,
  });

  const report = fs.readFileSync(
    path.join(tempFolder, entryPoint.tempReportFileName),
    'utf-8',
  );

  return {succeeded: result.succeeded, report};
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

    for (const packageDir of packageDirs) {
      const packageJsonPath = path.join(packageDir, 'package.json');
      if (!fs.existsSync(packageJsonPath)) {
        continue;
      }
      const packageJson = readJson(packageJsonPath);
      const {entryPoints, skipped} = collectEntryPoints(
        packageDir,
        packageJson,
      );
      allSkipped.push(...skipped);

      if (entryPoints.length === 0) {
        continue;
      }

      for (const entryPoint of entryPoints) {
        const context = `${String(packageJson.name)} (${entryPoint.exportKey})`;
        try {
          const {succeeded, report} = runExtractor(
            packageDir,
            packageJsonPath,
            entryPoint,
            tempFolder,
          );
          if (!succeeded) {
            errors.push({
              context,
              error: new Error('API Extractor reported errors'),
            });
            continue;
          }

          const snapshot = cleanReport(report);
          const outputPath = path.join(packageDir, entryPoint.outputFileName);

          if (verifyOnly) {
            let existing = null;
            try {
              existing = fs.readFileSync(outputPath, 'utf-8');
            } catch {}
            if (existing !== snapshot) {
              errors.push({
                context,
                error: new Error(
                  `Public API snapshot ${entryPoint.outputFileName} is out ` +
                    'of date. Run `js1 build metro-ts-defs` (internal) or ' +
                    '`yarn run build-api-snapshots` (OSS) to update it.',
                ),
              });
            }
            // Count every processed entry point so the summary reflects the
            // total number of snapshots verified, not just those already up to
            // date.
            generatedCount++;
          } else {
            fs.writeFileSync(outputPath, snapshot);
            generatedCount++;
          }
        } catch (error) {
          errors.push({context, error});
        }
      }
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
