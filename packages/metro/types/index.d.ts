/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @format
 * @oncall react_native
 */

export * from './Asset';
export * from './DeltaBundler/types';
export * from './ModuleGraph/worker/collectDependencies';
export * from './Server';
export * from './lib/reporting';

import type {ReadOnlyGraph} from './DeltaBundler/types';
import type {ServerOptions, default as MetroServer} from './Server';
import type {OutputOptions, RequestOptions} from './shared/types';
import type {HandleFunction} from 'connect';
import type {EventEmitter} from 'events';
import type {IncomingMessage, Server as HttpServer} from 'http';
import type {Server as HttpsServer} from 'https';
import type {CustomTransformOptions} from 'metro-babel-transformer';
import type {
  ConfigT,
  InputConfigT,
  MetroConfig,
  Middleware,
} from 'metro-config';
import type {Duplex} from 'stream';

import Yargs = require('yargs');

export {loadConfig, mergeConfig, resolveConfig} from 'metro-config';
export {Terminal} from 'metro-core';
export {TerminalReporter} from './lib/TerminalReporter';

export {HttpServer, HttpsServer};

interface MetroMiddleWare {
  attachHmrServer: (httpServer: HttpServer | HttpsServer) => void;
  end: () => void;
  metroServer: MetroServer;
  middleware: Middleware;
}

export interface RunMetroOptions extends ServerOptions {
  waitForBundler?: boolean;
}

interface WebsocketServer extends EventEmitter {
  handleUpgrade<T = WebsocketServer>(
    request: IncomingMessage,
    socket: Duplex,
    upgradeHead: Buffer,
    callback: (client: T, request: IncomingMessage) => void,
  ): void;
}

export interface RunServerOptions {
  hasReducedPerformance?: boolean;
  host?: string;
  onError?: (error: Error & {code?: string}) => void;
  onReady?: (server: HttpServer | HttpsServer) => void;
  secureServerOptions?: Record<string, unknown>;

  /** @deprecated since version 0.61 */
  secure?: boolean;

  /** @deprecated since version 0.61 */
  secureCert?: string;

  /** @deprecated since version 0.61 */
  secureKey?: string;

  unstable_extraMiddleware?: ReadonlyArray<HandleFunction>;
  waitForBundler?: boolean;
  watch?: boolean;
  websocketEndpoints?: {
    [path: string]: WebsocketServer;
  };
}

export interface RunBuildOptions {
  entry: string;
  dev?: boolean;
  out?: string;
  onBegin?: () => void;
  onComplete?: () => void;
  onProgress?: (transformedFileCount: number, totalFileCount: number) => void;
  minify?: boolean;
  output?: {
    build: (
      server: MetroServer,
      options: RequestOptions,
    ) => Promise<{
      code: string;
      map: string;
    }>;
    save: (
      entry: {
        code: string;
        map: string;
      },
      options: OutputOptions,
      postSave: (...args: string[]) => void,
    ) => Promise<unknown>;
  };
  platform?: string;
  sourceMap?: boolean;
  sourceMapUrl?: string;
}

interface BuildGraphOptions {
  entries: ReadonlyArray<string>;
  customTransformOptions?: CustomTransformOptions;
  dev?: boolean;
  minify?: boolean;
  onProgress?: (transformedFileCount: number, totalFileCount: number) => void;
  platform?: string;
  type?: 'module' | 'script';
}

export {MetroConfig};

export function runMetro(
  config: InputConfigT,
  options?: RunMetroOptions,
): Promise<MetroServer>;

export function createConnectMiddleware(
  config: ConfigT,
  options?: RunMetroOptions,
): Promise<MetroMiddleWare>;

export function runServer(
  config: ConfigT,
  options: RunServerOptions,
): Promise<HttpServer | HttpsServer>;

export function runBuild(
  config: ConfigT,
  options: RunBuildOptions,
): Promise<void>;

export function buildGraph(
  config: ConfigT,
  options: BuildGraphOptions,
): Promise<ReadOnlyGraph<void>>;

type BuildCommandOptions = Record<string, unknown> | null;
type ServeCommandOptions = Record<string, unknown> | null;

interface AttachMetroCLIOptions {
  build?: BuildCommandOptions;
  serve?: ServeCommandOptions;
  dependencies?: unknown;
}

export function attachMetroCli(
  yargs: typeof Yargs,
  options?: AttachMetroCLIOptions,
): typeof Yargs;
