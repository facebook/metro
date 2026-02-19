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

import DependencyPlugin from '../DependencyPlugin';
import path from 'path';

describe('DependencyPlugin', () => {
  let plugin: DependencyPlugin;
  let mockFiles;

  beforeEach(() => {
    jest.resetModules();
    mockFiles = {
      lookup: jest.fn(),
    };
  });

  describe('constructor', () => {
    test('creates plugin with null dependency extractor', () => {
      plugin = new DependencyPlugin({
        dependencyExtractor: null,
        computeDependencies: true,
        rootDir: '/project',
      });

      expect(plugin.name).toBe('dependencies');
    });

    test('creates plugin with custom dependency extractor', () => {
      const extractorPath = path.join(
        __dirname,
        '../../__tests__/dependencyExtractor.js',
      );
      plugin = new DependencyPlugin({
        dependencyExtractor: extractorPath,
        computeDependencies: true,
        rootDir: '/project',
      });

      expect(plugin.name).toBe('dependencies');
    });

    test('creates plugin with computeDependencies false', () => {
      plugin = new DependencyPlugin({
        dependencyExtractor: null,
        computeDependencies: false,
        rootDir: '/project',
      });

      expect(plugin.name).toBe('dependencies');
    });
  });

  describe('getCacheKey', () => {
    test('returns default cache key when no custom extractor', () => {
      plugin = new DependencyPlugin({
        dependencyExtractor: null,
        computeDependencies: true,
        rootDir: '/project',
      });

      expect(plugin.getCacheKey()).toBe('default-dependency-extractor');
    });

    test('returns different cache keys for different dependency extractors', () => {
      const extractorPath = path.join(
        __dirname,
        '../../__tests__/dependencyExtractor.js',
      );
      // $FlowFixMe[untyped-import]
      const dependencyExtractor = require('../../__tests__/dependencyExtractor');

      // Create plugin with cache key 'foo'
      dependencyExtractor.setCacheKey('foo');
      const plugin1 = new DependencyPlugin({
        dependencyExtractor: extractorPath,
        computeDependencies: true,
        rootDir: '/project',
      });
      const cacheKey1 = plugin1.getCacheKey();

      // Create plugin with cache key 'bar'
      dependencyExtractor.setCacheKey('bar');
      const plugin2 = new DependencyPlugin({
        dependencyExtractor: extractorPath,
        computeDependencies: true,
        rootDir: '/project',
      });
      const cacheKey2 = plugin2.getCacheKey();

      // Cache keys should be different
      expect(cacheKey1).not.toBe(cacheKey2);
      expect(cacheKey1).toContain('foo');
      expect(cacheKey2).toContain('bar');
    });

    test('cache key includes extractor path', () => {
      const extractorPath = path.join(
        __dirname,
        '../../__tests__/dependencyExtractor.js',
      );
      plugin = new DependencyPlugin({
        dependencyExtractor: extractorPath,
        computeDependencies: true,
        rootDir: '/project',
      });

      const cacheKey = plugin.getCacheKey();
      expect(cacheKey).toContain(JSON.stringify(extractorPath));
    });

    test('handles extractor without getCacheKey method', () => {
      const extractorPath = path.join(
        __dirname,
        '../../__tests__/dependencyExtractor.js',
      );
      // $FlowFixMe[untyped-import]
      const dependencyExtractor = require('../../__tests__/dependencyExtractor');

      // Temporarily remove getCacheKey
      const originalGetCacheKey = dependencyExtractor.getCacheKey;
      delete dependencyExtractor.getCacheKey;

      plugin = new DependencyPlugin({
        dependencyExtractor: extractorPath,
        computeDependencies: true,
        rootDir: '/project',
      });

      const cacheKey = plugin.getCacheKey();
      expect(cacheKey).toContain('null'); // Should include null for extractorKey

      // Restore getCacheKey
      dependencyExtractor.getCacheKey = originalGetCacheKey;
    });
  });

  describe('getWorker', () => {
    test('returns worker configuration with dependency extractor', () => {
      const extractorPath = path.join(
        __dirname,
        '../../__tests__/dependencyExtractor.js',
      );
      plugin = new DependencyPlugin({
        dependencyExtractor: extractorPath,
        computeDependencies: true,
        rootDir: '/project',
      });

      const worker = plugin.getWorker();

      expect(worker.worker.modulePath).toMatch(/dependencies[\\/]worker\.js$/);
      expect(worker.worker.setupArgs).toEqual({
        dependencyExtractor: extractorPath,
      });
    });

    test('returns worker configuration with null extractor', () => {
      plugin = new DependencyPlugin({
        dependencyExtractor: null,
        computeDependencies: true,
        rootDir: '/project',
      });

      const worker = plugin.getWorker();

      expect(worker.worker.setupArgs).toEqual({
        dependencyExtractor: null,
      });
    });

    test('filter returns false when computeDependencies is false', () => {
      plugin = new DependencyPlugin({
        dependencyExtractor: null,
        computeDependencies: false,
        rootDir: '/project',
      });

      const worker = plugin.getWorker();

      expect(
        worker.filter({normalPath: 'src/index.js', isNodeModules: false}),
      ).toBe(false);
    });

    test('filter returns false for node_modules files', () => {
      plugin = new DependencyPlugin({
        dependencyExtractor: null,
        computeDependencies: true,
        rootDir: '/project',
      });

      const worker = plugin.getWorker();

      expect(
        worker.filter({
          normalPath: 'node_modules/pkg/index.js',
          isNodeModules: true,
        }),
      ).toBe(false);
    });

    test('filter returns false for excluded extensions', () => {
      plugin = new DependencyPlugin({
        dependencyExtractor: null,
        computeDependencies: true,
        rootDir: '/project',
      });

      const worker = plugin.getWorker();

      // These extensions are in workerExclusionList
      expect(
        worker.filter({normalPath: 'image.png', isNodeModules: false}),
      ).toBe(false);
      expect(
        worker.filter({normalPath: 'data.json', isNodeModules: false}),
      ).toBe(false);
    });

    test('filter returns true for valid JavaScript files', () => {
      plugin = new DependencyPlugin({
        dependencyExtractor: null,
        computeDependencies: true,
        rootDir: '/project',
      });

      const worker = plugin.getWorker();

      expect(
        worker.filter({normalPath: 'src/index.js', isNodeModules: false}),
      ).toBe(true);
      expect(
        worker.filter({normalPath: 'src/Component.jsx', isNodeModules: false}),
      ).toBe(true);
    });
  });

  describe('initialize and getDependencies', () => {
    beforeEach(() => {
      plugin = new DependencyPlugin({
        dependencyExtractor: null,
        computeDependencies: true,
        rootDir: '/project',
      });
    });

    test('throws error if getDependencies called before initialize', () => {
      expect(() => {
        plugin.getDependencies('src/index.js');
      }).toThrow(
        'DependencyPlugin has not been initialized before getDependencies',
      );
    });

    test('returns null for non-existent file', async () => {
      mockFiles.lookup.mockReturnValue({
        exists: false,
      });

      // $FlowFixMe[unclear-type]
      await plugin.initialize({files: mockFiles} as any);

      expect(plugin.getDependencies('nonexistent.js')).toBeNull();
    });

    test('returns null for directory', async () => {
      mockFiles.lookup.mockReturnValue({
        exists: true,
        type: 'd',
      });

      // $FlowFixMe[unclear-type]
      await plugin.initialize({files: mockFiles} as any);

      expect(plugin.getDependencies('src')).toBeNull();
    });

    test('returns dependencies from plugin data', async () => {
      mockFiles.lookup.mockReturnValue({
        exists: true,
        type: 'f',
        pluginData: ['React', 'lodash', './utils'],
      });

      // $FlowFixMe[unclear-type]
      await plugin.initialize({files: mockFiles} as any);

      const deps = plugin.getDependencies('src/Component.js');
      expect(deps).toEqual(['React', 'lodash', './utils']);
    });

    test('returns [] when file exists but plugin data is not set', async () => {
      mockFiles.lookup.mockReturnValue({
        exists: true,
        type: 'f',
        pluginData: null,
      });

      // $FlowFixMe[unclear-type]
      await plugin.initialize({files: mockFiles} as any);

      expect(plugin.getDependencies('src/index.js')).toEqual([]);
    });

    test('handles empty dependencies array', async () => {
      mockFiles.lookup.mockReturnValue({
        exists: true,
        type: 'f',
        pluginData: [],
      });

      // $FlowFixMe[unclear-type]
      await plugin.initialize({files: mockFiles} as any);

      expect(plugin.getDependencies('src/index.js')).toEqual([]);
    });
  });

  describe('lifecycle methods', () => {
    beforeEach(() => {
      plugin = new DependencyPlugin({
        dependencyExtractor: null,
        computeDependencies: true,
        rootDir: '/project',
      });
    });

    test('getSerializableSnapshot returns null', () => {
      expect(plugin.getSerializableSnapshot()).toBeNull();
    });

    test('assertValid is a no-op', () => {
      expect(() => {
        plugin.assertValid();
      }).not.toThrow();
    });
  });
});
