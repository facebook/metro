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

export type ModuleMap = ReadonlyArray<[number, string]>;

export type Bundle = {
  +modules: ModuleMap,
  +post: string,
  +pre: string,
};

export type DeltaBundle = {
  +added: ModuleMap,
  +modified: ModuleMap,
  +deleted: ReadonlyArray<number>,
};

export type BundleVariant =
  | Readonly<{...Bundle, base: true, revisionId: string}>
  | Readonly<{...DeltaBundle, base: false, revisionId: string}>;

export type BundleMetadata = {
  +pre: number,
  +post: number,
  +modules: ReadonlyArray<[number, number]>,
};

export type FormattedError = {
  +type: string,
  +message: string,
  +errors: Array<{description: string, ...}>,
};

export type HmrModule = {
  +module: [number, string],
  +sourceMappingURL: string,
  +sourceURL: string,
};

export type HmrUpdate = {
  +added: ReadonlyArray<HmrModule>,
  +deleted: ReadonlyArray<number>,
  +isInitialUpdate: boolean,
  +modified: ReadonlyArray<HmrModule>,
  +revisionId: string,
};

export type HmrUpdateMessage = {
  +type: 'update',
  +body: HmrUpdate,
};

export type HmrErrorMessage = {
  +type: 'error',
  +body: FormattedError,
};

export type HmrClientMessage =
  | {
      +type: 'register-entrypoints',
      +entryPoints: Array<string>,
    }
  | {
      +type: 'log',
      +level:
        | 'trace'
        | 'info'
        | 'warn'
        | 'log'
        | 'group'
        | 'groupCollapsed'
        | 'groupEnd'
        | 'debug',
      +data: Array<unknown>,
    }
  | {
      +type: 'log-opt-in',
    };

export type HmrMessage =
  | {
      +type: 'bundle-registered',
    }
  | {
      +type: 'update-start',
      +body: {
        +isInitialUpdate: boolean,
      },
    }
  | {
      +type: 'update-done',
    }
  | HmrUpdateMessage
  | HmrErrorMessage;
