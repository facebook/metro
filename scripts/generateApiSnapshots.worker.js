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

// Worker module for `generateApiSnapshots.js`: generates (or verifies) every
// public API snapshot for a single package, on its own thread.

const {Extractor, ExtractorConfig} = require('@microsoft/api-extractor');
const fs = require('node:fs');
const path = require('node:path');
const {parentPort, workerData} = require('node:worker_threads');

/*::
export type PackageResult = {
  errors: Array<{context: string, error: Error}>,
  skipped: Array<string>,
  generatedCount: number,
};

type EntryPoint = {
  outputFileName: string,
  tempReportFileName: string,
  dtsPath: string,
  exportKey: string,
};
*/

// `generateApiSnapshots.js` always spawns this module as a worker; bail loudly
// if it is ever loaded some other way.
if (parentPort == null) {
  throw new Error(
    'generateApiSnapshotsForPackage.mjs must be run as a worker thread',
  );
}
const {packageDir, tempFolder, verifyOnly, workspaceRoot} = workerData;

// Extraction-only tsconfig (adds the "dom" lib on top of the project config).
// `workspaceRoot` is passed in rather than derived from this file's location,
// which as an ES module would need `import.meta.url`.
const TSCONFIG_PATH = path.join(workspaceRoot, 'tsconfig.api-extractor.json');

// Committed public API snapshot file, written at each package's root. One
// report is generated per public entry point.
const SNAPSHOT_FILENAME = 'API.md';

// package.json exports subpaths that never describe a public, type-generated
// entry point and are therefore excluded from snapshotting.
const NON_API_EXPORT_KEYS = new Set(['./package.json']);

function readJson(absolutePath /*: string */) {
  return JSON.parse(fs.readFileSync(absolutePath, 'utf-8'));
}

function unscopedName(packageName /*: string */) {
  return packageName.replace(/^@[^/]+\//, '');
}

// Resolve the exports target for a subpath to a single module path string,
// unwrapping conditional exports (picking a plain "." / "default" / first).
function resolveExportTarget(value /*: unknown */) {
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
function hasExports(dtsAbsolutePath /*: string */) {
  const source = fs.readFileSync(dtsAbsolutePath, 'utf-8');
  return /^\s*export[\s{*=]/m.test(source);
}

// Map a `./src/<rel>.js` exports target to its generated `types/<rel>.d.ts`.
function sourceTargetToDts(packageDir /*: string */, target /*: string */) {
  const match = /^\.\/src\/(.+)\.js$/.exec(target);
  if (match == null) {
    return null;
  }
  return path.join(packageDir, 'types', match[1] + '.d.ts');
}

// Committed snapshot file name for an entry point, written at the package
// root. The main entry is `API.md`; secondary subpaths are suffixed, e.g.
// `API-<subpath>.md`.
function outputFileNameFor(exportKey /*: string */) {
  if (exportKey === '.') {
    return SNAPSHOT_FILENAME;
  }
  const suffix = exportKey.replace(/^\.\//, '').replace(/\//g, '-');
  return `API-${suffix}.md`;
}

// Unique scratch report name handed to API Extractor, derived from the package
// name and exports subpath so all reports can share a single temp folder.
function tempReportFileNameFor(
  packageName /*: string */,
  exportKey /*: string */,
) {
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
  packageDir /*: string */,
  packageJson /*: Readonly<{name: string, exports: unknown, ...}> */,
) /*: {entryPoints: Array<EntryPoint>, skipped: Array<string>} */ {
  const packageName = String(packageJson.name);
  const exportsField = packageJson.exports;
  const entryPoints = [];
  const skipped = [];

  if (
    exportsField == null ||
    (typeof exportsField !== 'string' && typeof exportsField !== 'object')
  ) {
    return {entryPoints, skipped};
  }

  const entries =
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
        `${packageName} "${exportKey}" (no ${path.relative(workspaceRoot, dtsPath)})`,
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
//
// We also blank out the line numbers in any flow-api-translator code frame, so
// that moving an offending declaration within its source file doesn't churn the
// snapshot.
function cleanReport(report /*: string */) {
  const result = [];
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

    // flow-api-translator embeds a Babel code frame in the comment it emits for
    // constructs it cannot translate (e.g. Flow's `empty`). Its gutter carries
    // the line number in the *Flow source*, so any edit above that line — an
    // internal-only change with no effect on the public API — would otherwise
    // show up here. Blank the digits rather than removing them: the caret line
    // beneath is padded to the same gutter width, so keeping the width keeps it
    // aligned.
    line = line.replace(
      /^(\s*\*\s*>\s*)(\d+)(\s*\|)/,
      (_, before, digits, after) => before + ' '.repeat(digits.length) + after,
    );

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
  packageDir /*: string */,
  packageJsonPath /*: string */,
  entryPoint /*: Readonly<EntryPoint> */,
  tempFolder /*: string */,
) {
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
    // Silence API Extractor's per-invocation preamble, which is emitted once
    // per entry point and says only which TypeScript version it bundles and
    // that ours is newer. These are category 'console', which the `messages`
    // config above cannot route (there is no `consoleMessageReporting`
    // table), so they have to be discarded here. Suppress these two ids
    // specifically rather than the whole category, which also carries
    // genuine errors such as `console-api-report-folder-missing`.
    messageCallback: message => {
      if (
        message.messageId === 'console-preamble' ||
        message.messageId === 'console-compiler-version-notice'
      ) {
        message.logLevel = 'none';
      }
    },
  });

  const report = fs.readFileSync(
    path.join(tempFolder, entryPoint.tempReportFileName),
    'utf-8',
  );

  return {succeeded: result.succeeded, report};
}

// Generate (or verify) every snapshot for a single package. Pure with respect
// to other packages — each writes only its own `API*.md` files and its own
// uniquely-named scratch reports — so packages can run concurrently in
// separate worker threads. Returns a `PackageResult` (see the `.flow` sidecar).
function processPackage(
  packageDir /*: string */,
  tempFolder /*: string */,
  verifyOnly /*: boolean */,
) /*: PackageResult */ {
  const errors = [];
  const packageJsonPath = path.join(packageDir, 'package.json');
  if (!fs.existsSync(packageJsonPath)) {
    return {errors, skipped: [], generatedCount: 0};
  }
  const packageJson = readJson(packageJsonPath);
  const {entryPoints, skipped} = collectEntryPoints(packageDir, packageJson);
  let generatedCount = 0;

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

  return {errors, skipped, generatedCount};
}

module.exports = {
  processPackage,
};

parentPort.postMessage(processPackage(packageDir, tempFolder, verifyOnly));
