/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow strict
 * @format
 */

declare module 'fb-watchman' {
  declare type WatchmanWatchResponse = $ReadOnly<{
    watch: string,
    relative_path: string,
    ...
  }>;

  declare type WatchmanFile = $ReadOnly<{|
    +exists: true,
    +name: string,
    +'content.sha1hex': string,
  |}>;

  declare type WatchmanQueryResponse = $ReadOnly<{|
    files: $ReadOnlyArray<WatchmanFile>,
  |}>;

  declare type WatchmanExpression = Array<
    string | $ReadOnly<{includedotfiles: boolean}> | WatchmanExpression,
  >;

  declare type WatchmanQuerySince = {|
    scm: {
      'mergebase-with': string,
      ...
    },
  |};

  declare type WatchmanQuery = {|
    expression: WatchmanExpression,
    fields: $ReadOnlyArray<string>,
    glob?: $ReadOnlyArray<string>,
    path?: $ReadOnlyArray<string>,
    // A repo-root-relative path to a subdirectory within which
    // the query will be constrained.  Returned file names in
    // WatchmanFile will be relative to this location.
    relative_root?: string,
    since?: WatchmanQuerySince,
    suffix?: string,
  |};

  declare class Client {
    // $FlowFixMe[unclear-type] - Check implementation for types
    capabilityCheck(config: Object, callback: (error: any) => void): void;
    command(
      config: ['watch-project', string],
      // $FlowFixMe[unclear-type] - Check implementation for types
      callback: (error: any, response: WatchmanWatchResponse) => void,
    ): void;
    command(
      config: ['query', string, WatchmanQuery],
      // $FlowFixMe[unclear-type] - Check implementation for types
      callback: (error: any, response: WatchmanQueryResponse) => void,
    ): void;
    command(
      config: ['find', string, string],
      // $FlowFixMe[unclear-type] - Check implementation for types
      callback: (error: any, response: WatchmanQueryResponse) => void,
    ): void;
    end(): void;
  }

  declare module.exports: {Client: Class<Client>};
}
