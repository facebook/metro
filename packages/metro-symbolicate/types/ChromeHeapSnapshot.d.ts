/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @format
 * @oncall react_native
 */

type RawBuffer = Array<number | RawBuffer>;
export type ChromeHeapSnapshot = {
  snapshot: {
    meta: {
      trace_function_info_fields: Array<string>;
      location_fields: Array<string>;
      edge_fields: Array<string>;
      edge_types: Array<string | Array<string>>;
      node_fields: Array<string>;
      node_types: Array<string | Array<string>>;
      trace_node_fields: Array<string>;
    };
  };
  trace_function_infos: Array<number>;
  locations: Array<number>;
  edges: Array<number>;
  nodes: Array<number>;
  strings: Array<string>;
  trace_tree: RawBuffer;
};
export declare class ChromeHeapSnapshotProcessor {
  readonly _snapshotData: ChromeHeapSnapshot;
  readonly _globalStringTable: ChromeHeapSnapshotStringTable;
  constructor(snapshotData: ChromeHeapSnapshot);
  traceFunctionInfos(): ChromeHeapSnapshotRecordIterator;
  locations(): ChromeHeapSnapshotRecordIterator;
  nodes(): ChromeHeapSnapshotRecordIterator;
  edges(): ChromeHeapSnapshotRecordIterator;
  traceTree(): ChromeHeapSnapshotRecordIterator;
}
declare class ChromeHeapSnapshotStringTable {
  readonly _strings: Array<string>;
  readonly _indexCache: Map<string, number>;
  constructor(strings: Array<string>);
  add(value: string): number;
  get(index: number): string;
  _syncIndexCache(): void;
}
type ChromeHeapSnapshotFieldType = Array<string> | string;
type DenormalizedRecordInput = Readonly<{
  [field: string]: string | number | ReadonlyArray<DenormalizedRecordInput>;
}>;
declare class ChromeHeapSnapshotRecordAccessor {
  readonly _fieldToOffset: ReadonlyMap<string, number>;
  readonly _fieldToType: ReadonlyMap<string, ChromeHeapSnapshotFieldType>;
  readonly _recordSize: number;
  readonly _buffer: RawBuffer;
  readonly _globalStringTable: ChromeHeapSnapshotStringTable;
  _position: number;
  constructor(
    buffer: RawBuffer,
    recordFields: Array<string>,
    recordTypes:
      | Array<ChromeHeapSnapshotFieldType>
      | Readonly<{[$$Key$$: string]: ChromeHeapSnapshotFieldType}>
      | null,
    globalStringTable: ChromeHeapSnapshotStringTable,
    position: number,
    parent?: ChromeHeapSnapshotRecordAccessor,
  );
  /** Public API */

  getString(field: string): string;
  getNumber(field: string): number;
  getChildren(field: string): ChromeHeapSnapshotRecordIterator;
  setString(field: string, value: string): void;
  setNumber(field: string, value: number): void;
  moveToRecord(recordIndex: number): void;
  append(record: DenormalizedRecordInput): number;
  moveAndInsert(recordIndex: number, record: DenormalizedRecordInput): number;
  /** "Protected" methods (please don't use) */

  protectedHasNext(): boolean;
  protectedTryMoveNext(): void;
  /** Private methods */

  _getRaw(field: string): number | RawBuffer;
  _getScalar(field: string): string | number;
  _setRaw(field: string, rawValue: number | RawBuffer): void;
  _set(
    field: string,
    value: string | number | ReadonlyArray<DenormalizedRecordInput>,
  ): void;
  _setChildren(
    field: string,
    value: ReadonlyArray<DenormalizedRecordInput>,
  ): void;
  _encodeString(field: string, value: string): number;
  _validatePosition(allowEnd?: boolean, position?: number): void;
  _moveToPosition(nextPosition: number, allowEnd?: boolean): void;
}
declare class ChromeHeapSnapshotRecordIterator
  extends ChromeHeapSnapshotRecordAccessor
  implements Iterable<ChromeHeapSnapshotRecordAccessor>
{
  constructor(
    buffer: RawBuffer,
    recordFields: Array<string>,
    recordTypes:
      | Array<ChromeHeapSnapshotFieldType>
      | Readonly<{[$$Key$$: string]: ChromeHeapSnapshotFieldType}>
      | null,
    globalStringTable: ChromeHeapSnapshotStringTable,
    position?: number,
    parent?: ChromeHeapSnapshotRecordAccessor,
  );
  next(): IteratorResult<ChromeHeapSnapshotRecordIterator, void>;
  [Symbol.iterator](): ChromeHeapSnapshotRecordIterator;
}
