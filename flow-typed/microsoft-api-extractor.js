/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow strict
 * @format
 */

// Minimal libdef covering only the subset of API Extractor's programmatic API
// used by scripts/generateApiSnapshots.js. See https://api-extractor.com/.
declare module '@microsoft/api-extractor' {
  // The `configObject` accepts API Extractor's `IConfigFile` shape, which is
  // large and only partially populated by callers; modelled as an inexact
  // object so any subset of its fields is accepted.
  declare export type IConfigFile = {...};

  declare export type IExtractorConfigPrepareOptions = {
    configObject: IConfigFile,
    // Absolute path from which relative paths in `configObject` are resolved.
    configObjectFullPath: string | void,
    // Absolute path to the entry point package's package.json.
    packageJsonFullPath: string,
    ...
  };

  declare export class ExtractorConfig {
    static prepare(options: IExtractorConfigPrepareOptions): ExtractorConfig;
    // Load an api-extractor.json config file from disk and prepare it.
    static loadFileAndPrepare(configJsonFilePath: string): ExtractorConfig;
  }

  declare export type IExtractorInvokeOptions = {
    // When true, update the API report on disk; when false (CI), leave it
    // untouched and flag any difference via `apiReportChanged`.
    localBuild?: boolean,
    showVerboseMessages?: boolean,
    showDiagnostics?: boolean,
    ...
  };

  declare export type ExtractorResult = {
    readonly succeeded: boolean,
    readonly apiReportChanged: boolean,
    readonly errorCount: number,
    readonly warningCount: number,
    ...
  };

  declare export class Extractor {
    static invoke(
      config: ExtractorConfig,
      options?: IExtractorInvokeOptions,
    ): ExtractorResult;
  }
}
