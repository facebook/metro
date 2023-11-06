/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow strict
 * @format
 * @oncall react_native
 */

declare module 'fb-watchman' {
  declare type WatchmanBaseResponse = $ReadOnly<{
    version: string,
    clock: string,
  }>;

  declare type WatchmanClockResponse = $ReadOnly<{
    ...WatchmanBaseResponse,
    warning?: string,
  }>;

  declare type WatchmanSubscribeResponse = $ReadOnly<{
    ...WatchmanBaseResponse,
    subscribe: string,
    warning?: string,
    'asserted-states'?: $ReadOnlyArray<string>,
  }>;

  declare type WatchmanWatchResponse = $ReadOnly<{
    ...WatchmanBaseResponse,
    watch: string,
    watcher: string,
    relative_path: string,
    warning?: string,
  }>;

  declare type WatchmanWatchListResponse = $ReadOnly<{
    ...WatchmanBaseResponse,
    roots: $ReadOnlyArray<string>,
  }>;

  declare type WatchmanSubscriptionEvent = {
    subscription: string,
    is_fresh_instance: boolean,
    files: $ReadOnlyArray<WatchmanFileChange>,
    'state-enter'?: ?string,
    'state-leave'?: ?string,
  };

  declare type WatchmanLogEvent = mixed;

  declare type SavedStateInfo = $ReadOnly<{
    'manifold-path': ?string,
    'manifold-bucket': ?string,
    error: ?string,
  }>;

  declare type WatchmanFileType =
    | 'b' // block special file
    | 'c' // character special file
    | 'd' // directory
    | 'f' // regular file
    | 'l' // symbolic link
    | 'p' // named pipe (fifo)
    | 's' // socket
    | 'D' // Solaris Door
    | '?'; // An unknown file type

  declare type WatchmanFile = $ReadOnly<{
    name: string,
    exists: boolean,
    type?: WatchmanFileType,
    mtime_ms?: number | $ReadOnly<{toNumber: () => number}>,
    size?: number,
    'content.sha1hex'?: string,
    symlink_target?: string,
  }>;

  declare type WatchmanFileChange = $ReadOnly<{
    ...WatchmanFile,
    new: boolean,
  }>;

  declare type WatchmanQueryResponse = $ReadOnly<{
    'saved-state-info'?: SavedStateInfo,
    files: $ReadOnlyArray<WatchmanFile>,
    clock: {
      scm: {'mergebase-with': string, mergebase: string},
      clock: string,
    },
    is_fresh_instance: boolean,
    version: string,
    warning?: string,
  }>;

  declare type WatchmanDirnameExpression = ['dirname' | 'idirname', string];

  declare type WatchmanMatchExpression =
    | ['match' | 'imatch', string]
    | ['match' | 'imatch', string, 'basename' | 'wholename']
    | [
        'match' | 'imatch',
        string,
        'basename' | 'wholename',
        $ReadOnly<{includedotfiles?: boolean, noescape?: boolean}>,
      ];

  declare type WatchmanNotExpression = ['not', WatchmanExpression];

  declare type WatchmanSuffixExpression = [
    'suffix',
    string | $ReadOnlyArray<string>,
  ];
  declare type WatchmanNameExpression =
    | ['name' | 'iname', string | $ReadOnlyArray<string>]
    | [
        'name' | 'iname',
        string | $ReadOnlyArray<string>,
        'basename' | 'wholename',
      ];

  declare type WatchmanTypeExpression = ['type', WatchmanFileType];

  // Would be ['allof' | 'anyof', ...WatchmanExpression] if Flow supported
  // variadic tuples
  declare type WatchmanVariadicExpression = Array<
    'allof' | 'anyof' | WatchmanExpression,
  >;

  declare type WatchmanExpression =
    | WatchmanDirnameExpression
    | WatchmanMatchExpression
    | WatchmanNotExpression
    | WatchmanNameExpression
    | WatchmanSuffixExpression
    | WatchmanTypeExpression
    | WatchmanVariadicExpression;

  declare type WatchmanQuerySince =
    | string
    | $ReadOnly<{
        scm: $ReadOnly<{
          'mergebase-with': string,
          'saved-state'?: {
            storage: string,
            config: {project: string, ...},
          },
        }>,
      }>;

  declare type WatchmanQuery = {
    defer?: $ReadOnlyArray<string>,
    expression?: WatchmanExpression,
    fields: $ReadOnlyArray<string>,
    glob?: $ReadOnlyArray<string>,
    glob_includedotfiles?: boolean,
    path?: $ReadOnlyArray<string>,
    // A repo-root-relative path to a subdirectory within which
    // the query will be constrained.  Returned file names in
    // WatchmanFile will be relative to this location.
    relative_root?: string,
    since?: WatchmanQuerySince,
    suffix?: string | $ReadOnlyArray<string>,
  };

  declare class Client {
    capabilityCheck(
      config: $ReadOnly<{
        optional?: $ReadOnlyArray<string>,
        required?: $ReadOnlyArray<string>,
      }>,
      callback: (
        error: ?Error,
        response: ?{
          version: string,
          capabilities: $ReadOnly<{[string]: boolean}>,
        },
      ) => void,
    ): void;
    command(
      config: ['watch-project', string],
      callback: (error: ?Error, response: WatchmanWatchResponse) => void,
    ): void;
    command(
      config: ['watch-list'],
      callback: (error: ?Error, response: WatchmanWatchListResponse) => void,
    ): void;
    command(
      config: ['query', string, WatchmanQuery],
      callback: (error: ?Error, response: WatchmanQueryResponse) => void,
    ): void;
    command(
      config: ['find', string, string],
      callback: (error: ?Error, response: WatchmanQueryResponse) => void,
    ): void;
    command(
      config: ['clock', string],
      callback: (error: ?Error, response: WatchmanClockResponse) => void,
    ): void;
    command(
      config: ['subscribe', string, string, WatchmanQuery],
      callback: (error: ?Error, response: WatchmanSubscribeResponse) => void,
    ): void;
    command(
      config: ['state-enter', string, string],
      callback: (error: ?Error, response: WatchmanBaseResponse) => void,
    ): void;
    command(
      config: ['state-leave', string, string],
      callback: (error: ?Error, response: WatchmanBaseResponse) => void,
    ): void;
    end(): void;

    on('connect', () => void): void;
    on('end', () => void): void;
    on('error', (error: Error) => void): void;
    on('subscription', (event: WatchmanSubscriptionEvent) => void): void;
    on('log', (event: WatchmanLogEvent) => void): void;
    removeAllListeners: (eventName?: string) => void;
  }

  declare module.exports: {Client: Class<Client>};
}
