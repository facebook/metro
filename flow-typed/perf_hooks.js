/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow strict
 * @format
 */

// An incomplete definition for Node's builtin `perf_hooks` module.

declare module 'perf_hooks' {
  export interface Histogram {
    /**
     * Returns a `Map` object detailing the accumulated percentile distribution.
     */
    +percentiles: Map<number, number>;
    /**
     * The number of times the event loop delay exceeded the maximum 1 hour event
     * loop delay threshold.
     */
    +exceeds: number;
    /**
     * The minimum recorded event loop delay.
     */
    +min: number;
    /**
     * The maximum recorded event loop delay.
     */
    +max: number;
    /**
     * The mean of the recorded event loop delays.
     */
    +mean: number;
    /**
     * The standard deviation of the recorded event loop delays.
     */
    +stddev: number;
    /**
     * Resets the collected histogram data.
     */
    reset(): void;
    /**
     * Returns the value at the given percentile.
     * @param percentile A percentile value in the range (0, 100].
     */
    percentile(percentile: number): number;
  }

  export interface IntervalHistogram extends Histogram {
    /**
     * Enables the update interval timer. Returns `true` if the timer was
     * started, `false` if it was already started.
     */
    enable(): boolean;
    /**
     * Disables the update interval timer. Returns `true` if the timer was
     * stopped, `false` if it was already stopped.
     */
    disable(): boolean;
  }

  declare export class PerformanceEntry {
    +duration: DOMHighResTimeStamp;
    +entryType: string;
    +name: string;
    +startTime: DOMHighResTimeStamp;
  }

  declare export class PerformanceMark<T = mixed> extends PerformanceEntry {
    +detail: T;
  }

  declare export class PerformanceMeasure<T = mixed> extends PerformanceEntry {
    +detail: T;
  }

  declare export class PerformanceNodeEntry extends PerformanceEntry {
    +detail: mixed;
  }

  declare export class PerformanceObserverEntryList {
    getEntries: () => Array<PerformanceEntry>;
    getEntriesByName: (name: string, type?: string) => Array<PerformanceEntry>;
    getEntriesByType: (type: string) => Array<PerformanceEntry>;
  }

  declare export class PerformanceObserver {
    static supportedEntryTypes: $ReadOnlyArray<string>;
    constructor(callback: PerformanceObserverCallback): this;
    observe(
      options: $ReadOnly<{
        entryTypes: $ReadOnlyArray<string>,
        buffered?: boolean,
      }>,
    ): void;
    takeRecords(): Array<PerformanceEntry>;
    disconnect(): void;
  }

  export type PerformanceObserverCallback = (
    list: PerformanceObserverEntryList,
    observer: PerformanceObserver,
  ) => void;

  export type PerformanceEntryFilterOptions = $ReadOnly<{
    entryType: string,
    initiatorType: string,
    name: string,
    ...
  }>;

  export type PerformanceMarkOptions<T = mixed> = $ReadOnly<{
    detail?: T,
    startTime?: number,
  }>;

  export type PerformanceMeasureOptions<T = mixed> = $ReadOnly<{
    detail?: T,
    duration?: number,
    end?: number | string,
    start?: number | string,
  }>;

  declare export function monitorEventLoopDelay(options?: {
    /**
     * The sampling rate in milliseconds.
     * Must be greater than zero.
     * @default 10
     */
    resolution?: number | void,
  }): IntervalHistogram;

  export interface EventLoopUtilization {
    +utilization: number;
    +idle: number;
    +active: number;
  }

  declare export var performance: {
    clearMarks(name?: string): void,
    clearMeasures(name?: string): void,
    clearResourceTimings(): void,

    eventCounts: EventCounts,
    getEntries: (
      options?: PerformanceEntryFilterOptions,
    ) => Array<PerformanceEntry>,
    getEntriesByName: (name: string, type?: string) => Array<PerformanceEntry>,
    getEntriesByType: (type: string) => Array<PerformanceEntry>,
    mark<T>(
      name: string,
      options?: PerformanceMarkOptions<T>,
    ): PerformanceMark<T>,
    measure<T>(
      name: string,
      startMarkOrOptions?: string | PerformanceMeasureOptions<T>,
      endMark?: string,
    ): PerformanceMeasure<T>,
    now: () => DOMHighResTimeStamp,
    setResourceTimingBufferSize(maxSize: number): void,
    +timeOrigin: DOMHighResTimeStamp,
    timing: PerformanceTiming,
    toJSON(): string,

    // Node.js-specific extensions
    eventLoopUtilization(
      elu1?: EventLoopUtilization,
      elu2?: EventLoopUtilization,
    ): EventLoopUtilization,
    nodeTiming: PerformanceNodeEntry,
    timerify<TArgs: Iterable<mixed>, TReturn>(
      f: (...TArgs) => TReturn,
    ): (...TArgs) => TReturn,
  };
}
