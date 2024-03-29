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

// $FlowFixMe[unsupported-syntax]
declare module 'fsevents' {
  declare type Event =
    | 'created'
    | 'cloned'
    | 'modified'
    | 'deleted'
    | 'moved'
    | 'root-changed'
    | 'unknown';

  declare type Type = 'file' | 'directory' | 'symlink';

  declare type FileChanges = {
    inode: boolean,
    finder: boolean,
    access: boolean,
    xattrs: boolean,
  };

  declare type Info = {
    event: Event,
    path: string,
    type: Type,
    changes: FileChanges,
    flags: number,
  };

  declare type WatchHandler = (path: string, flags: number, id: string) => void;

  declare type FSEvents = {
    watch(path: string, handler: WatchHandler): () => Promise<void>,
    getInfo(path: string, flags: number): Info,
    constants: {
      None: 0x00000000,
      MustScanSubDirs: 0x00000001,
      UserDropped: 0x00000002,
      KernelDropped: 0x00000004,
      EventIdsWrapped: 0x00000008,
      HistoryDone: 0x00000010,
      RootChanged: 0x00000020,
      Mount: 0x00000040,
      Unmount: 0x00000080,
      ItemCreated: 0x00000100,
      ItemRemoved: 0x00000200,
      ItemInodeMetaMod: 0x00000400,
      ItemRenamed: 0x00000800,
      ItemModified: 0x00001000,
      ItemFinderInfoMod: 0x00002000,
      ItemChangeOwner: 0x00004000,
      ItemXattrMod: 0x00008000,
      ItemIsFile: 0x00010000,
      ItemIsDir: 0x00020000,
      ItemIsSymlink: 0x00040000,
      ItemIsHardlink: 0x00100000,
      ItemIsLastHardlink: 0x00200000,
      OwnEvent: 0x00080000,
      ItemCloned: 0x00400000,
    },
  };

  declare module.exports: FSEvents;
}
