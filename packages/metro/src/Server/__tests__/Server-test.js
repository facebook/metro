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

import type {Graph} from '../../DeltaBundler/Graph';
import type {
  Dependency,
  Module,
  Options,
  ReadOnlyGraph,
} from '../../DeltaBundler/types.flow';

// $FlowFixMe[untyped-import]
import MockResponse from 'mock-res';
// $FlowFixMe[untyped-import]
import MockRequest from 'mock-req';
import {mergeConfig} from 'metro-config/src';

const ResourceNotFoundError = require('../../IncrementalBundler/ResourceNotFoundError');
const {MAGIC_NUMBER} = require('../../lib/bundleToBytecode');
const {getDefaultValues} = require('metro-config/src/defaults');
const {
  VERSION: BYTECODE_VERSION,
  align,
  compile,
  validateBytecodeModule,
} = require('metro-hermes-compiler');
const path = require('path');

jest
  .mock('jest-worker', () => ({}))
  .mock('fs')
  .mock('../../Bundler')
  .mock('../../DeltaBundler')
  .mock('../../node-haste/DependencyGraph')
  .mock('metro-core/src/Logger');

const mockConsoleError = jest
  .spyOn(console, 'error')
  .mockImplementation(() => {});
const mockConsoleWarn = jest
  .spyOn(console, 'warn')
  .mockImplementation(() => {});

const NativeDate = global.Date;

describe('processRequest', () => {
  let Bundler;
  let Server;
  let dependencies: Map<string, Module<>>;
  let fs;
  let getPrependedScripts;
  let DeltaBundler;

  let buildGraph;
  let getDelta;
  let getDependencyGraph;
  let getTransformFn;
  let getResolveDependencyFn;
  let getAsset;

  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();

    global.Date = NativeDate;

    buildGraph = jest.fn();
    getDelta = jest.fn();
    getDependencyGraph = jest.fn();
    getTransformFn = jest.fn();
    getResolveDependencyFn = jest.fn();
    getAsset = jest.fn();

    let i = 0;
    jest.doMock('crypto', () => ({
      ...jest.requireActual('crypto'),
      randomBytes: jest.fn().mockImplementation(() => `XXXXX-${i++}`),
    }));

    jest.doMock('../../Assets', () => ({
      ...jest.requireActual('../../Assets'),
      getAsset,
    }));

    getPrependedScripts = jest.fn();
    jest.doMock('../../lib/getPrependedScripts', () => getPrependedScripts);

    jest.doMock('../../lib/transformHelpers', () => ({
      ...jest.requireActual('../../lib/transformHelpers'),
      getTransformFn,
      getResolveDependencyFn,
    }));

    Bundler = require('../../Bundler');
    jest
      .spyOn(Bundler.prototype, 'getDependencyGraph')
      .mockImplementation(getDependencyGraph);

    jest.mock('fs', () => new (require('metro-memory-fs'))());
    fs = require('fs');

    DeltaBundler = require('../../DeltaBundler');
    jest
      .spyOn(DeltaBundler.prototype, 'buildGraph')
      .mockImplementation(buildGraph);
    jest.spyOn(DeltaBundler.prototype, 'getDelta').mockImplementation(getDelta);

    Server = require('../../Server');
  });

  afterEach(() => {
    expect(mockConsoleWarn).not.toHaveBeenCalled();
    expect(mockConsoleError).not.toHaveBeenCalled();
  });

  let server;

  const config = mergeConfig(getDefaultValues('/'), {
    projectRoot: '/root',
    watchFolders: ['/root'],
    resolver: {blockList: []},
    cacheVersion: '',
    serializer: {
      getRunModuleStatement: moduleId =>
        `require(${JSON.stringify(moduleId)});`,
      polyfillModuleNames: [],
      getModulesRunBeforeMainModule: () => ['InitializeCore'],
    },

    reporter: require('../../lib/reporting').nullReporter,
    server: {
      rewriteRequestUrl(requrl) {
        const rewritten = requrl.replace(/__REMOVE_THIS_WHEN_REWRITING__/g, '');
        if (rewritten !== requrl) {
          return rewritten + '&TEST_URL_WAS_REWRITTEN=true';
        }
        return requrl;
      },
    },
    symbolicator: {
      customizeFrame: ({file}) => {
        if (file === '/root/foo.js') {
          return {collapse: true};
        }
        return null;
      },
    },
  });

  const makeRequest = (
    requrl: string,
    options?: ?$ReadOnly<{
      method?: string,
      headers?: $ReadOnly<{[string]: string}>,
      rawBody?: string,
    }>,
  ) =>
    new Promise<$FlowFixMe>((resolve, reject) => {
      const {rawBody, method, ...reqOptions} = options ?? {};
      const actualMethod = method ?? (rawBody != null ? 'POST' : 'GET');
      const req = new MockRequest({
        url: requrl,
        method: actualMethod,
        headers: {host: 'localhost:8081'},
        ...reqOptions,
      });
      if (rawBody != null) {
        req.write(rawBody);
        req.end();

        // We implicitly depend on a body parser within `connect` that sets this
        req.rawBody = rawBody;
      }
      const res: $FlowFixMe = new MockResponse(() => {
        resolve(res);
      });
      res.on('error', reject);
      server.processRequest(req, res, reject);
    });

  beforeEach(() => {
    const currentGraphs = new Set<ReadOnlyGraph<>>();
    buildGraph.mockImplementation(
      async (
        entryPoints: $ReadOnlyArray<string>,
        options: Options<>,
        resolverOptions: mixed,
        otherOptions: mixed,
      ) => {
        // $FlowFixMe[prop-missing]
        dependencies = new Map<string, Module<>>([
          [
            '/root/mybundle.js',
            // $FlowFixMe[prop-missing]
            {
              path: '/root/mybundle.js',
              // $FlowFixMe[prop-missing]
              dependencies: new Map<string, Dependency>([
                [
                  'foo',
                  // $FlowFixMe[prop-missing]
                  {
                    absolutePath: '/root/foo.js',
                    // $FlowFixMe[prop-missing]
                    data: {isAsync: false, name: 'foo'},
                  },
                ],
              ]),
              getSource: () => Buffer.from('code-mybundle'),
              output: [
                {
                  type: 'js/module',
                  data: {
                    code: '__d(function() {entry();});',
                    lineCount: 1,
                    map: [[1, 16, 1, 0]],
                  },
                },
                {
                  type: 'bytecode/module',
                  data: {
                    bytecode: compile('__d(function() {entry();});', {
                      sourceURL: '/root/mybundle.js',
                    }).bytecode,
                  },
                },
              ],
            },
          ],
        ]);
        if (!options.shallow) {
          // $FlowFixMe[prop-missing]
          dependencies.set('/root/foo.js', {
            path: '/root/foo.js',
            dependencies: new Map(),
            getSource: () => Buffer.from('code-foo'),
            output: [
              {
                type: 'js/module',
                data: {
                  code: '__d(function() {foo();});',
                  lineCount: 1,
                  map: [[1, 16, 1, 0]],
                  functionMap: {names: ['<global>'], mappings: 'AAA'},
                },
              },
              {
                type: 'bytecode/module',
                data: {
                  bytecode: compile('__d(function() {foo();});', {
                    sourceURL: '/root/foo.js',
                  }).bytecode,
                },
              },
            ],
          });
        }

        // NOTE: The real buildGraph returns a mutable Graph instance, but we
        // mock out all of the code paths that depend on this so we can use this
        // simpler interface instead.
        const graph: ReadOnlyGraph<> = {
          entryPoints: new Set(['/root/mybundle.js']),
          dependencies,
          transformOptions: options.transformOptions,
        };
        currentGraphs.add(graph);

        return graph;
      },
    );
    getDelta.mockImplementation(
      async (graph: Graph<>, {reset}: {reset: boolean, ...}) => {
        if (!currentGraphs.has(graph)) {
          throw new Error('Graph not found');
        }

        return {
          added: reset ? dependencies : new Map<string, Module<>>(),
          modified: new Map<string, Module<>>(),
          deleted: new Set<string>(),
          reset,
        };
      },
    );

    getPrependedScripts.mockReturnValue(
      Promise.resolve([
        {
          path: 'require-js',
          dependencies: new Map<string, Module<>>(),
          getSource: () => Buffer.from('code-require'),
          output: [
            {
              type: 'js/script',
              data: {
                code: 'function () {require();}',
                lineCount: 1,
                map: [],
              },
            },
            {
              type: 'bytecode/script',
              data: {
                bytecode: compile('(function () {require();})', {
                  sourceURL: 'require-js',
                }).bytecode,
              },
            },
          ],
        },
      ]),
    );

    getDependencyGraph.mockReturnValue(
      Promise.resolve({
        getHasteMap: jest.fn().mockReturnValue({on: jest.fn()}),
        load: jest.fn(() => Promise.resolve()),
        getWatcher: jest.fn(() => ({})),
      }),
    );

    server = new Server(config);

    getTransformFn.mockReturnValue(() => {});
    getResolveDependencyFn.mockReturnValue((a, b) =>
      path.resolve(a, `${b}.js`),
    );

    // $FlowFixMe[cannot-write]
    fs.realpath = jest.fn((file, cb) => cb?.(null, '/root/foo.js'));
  });

  it('returns JS bundle source on request of *.bundle', async () => {
    const response = await makeRequest('mybundle.bundle?runModule=true', null);

    expect(response._getString()).toEqual(
      [
        'function () {require();}',
        '__d(function() {entry();},0,[1],"mybundle.js");',
        '__d(function() {foo();},1,[],"foo.js");',
        'require(0);',
        '//# sourceMappingURL=//localhost:8081/mybundle.map?runModule=true',
        '//# sourceURL=http://localhost:8081/mybundle.bundle?runModule=true',
      ].join('\n'),
    );
  });

  it('returns a bytecode bundle source on request of *.bundle?runtimeBytecodeVersion', async () => {
    const response = await makeRequest(
      `mybundle.bundle?runtimeBytecodeVersion=${BYTECODE_VERSION}&runModule=true`,
      null,
    );

    expect(response.getHeader('Content-Type')).toEqual(
      'application/x-metro-bytecode-bundle',
    );

    const buffer = Buffer.concat(response._responseData);
    const numberOfModules = buffer.readUInt32LE(4);

    expect(buffer.readUInt32LE(0)).toEqual(MAGIC_NUMBER);
    expect(numberOfModules).toEqual(8);

    let offset = 8;
    let modules = 0;
    while (offset < buffer.length) {
      expect(() => validateBytecodeModule(buffer, offset + 4)).not.toThrow();
      offset = align(offset + buffer.readUInt32LE(offset)) + 4;
      modules++;
    }

    expect(modules).toEqual(numberOfModules);
  });

  it('returns JS bundle without the initial require() call', async () => {
    const response = await makeRequest('mybundle.bundle?runModule=false', null);

    expect(response._getString()).toEqual(
      [
        'function () {require();}',
        '__d(function() {entry();},0,[1],"mybundle.js");',
        '__d(function() {foo();},1,[],"foo.js");',
        '//# sourceMappingURL=//localhost:8081/mybundle.map?runModule=false',
        '//# sourceURL=http://localhost:8081/mybundle.bundle?runModule=false',
      ].join('\n'),
    );
  });

  it('returns Last-Modified header on request of *.bundle', () => {
    return makeRequest('mybundle.bundle?runModule=true').then(response => {
      expect(response.getHeader('Last-Modified')).toBeDefined();
    });
  });

  it('returns build info headers on request of *.bundle', async () => {
    const response = await makeRequest('mybundle.bundle?runModule=true');

    expect(response.getHeader('X-Metro-Files-Changed-Count')).toEqual('3');
  });

  it('returns Content-Length header on request of *.bundle', () => {
    return makeRequest('mybundle.bundle?runModule=true').then(response => {
      expect(response.getHeader('Content-Length')).toEqual(
        '' + Buffer.byteLength(response._getString()),
      );
    });
  });

  it('returns 404 on request of *.bundle when resource does not exist', async () => {
    // $FlowFixMe[cannot-write]
    fs.realpath = jest.fn((file, cb: $FlowFixMe) =>
      cb(new ResourceNotFoundError('unknown.bundle')),
    );

    return makeRequest('unknown.bundle?runModule=true').then(response => {
      expect(response.statusCode).toEqual(404);
      expect(response._getString()).toEqual(
        expect.stringContaining('ResourceNotFoundError'),
      );
    });
  });

  it('returns 304 on request of *.bundle when if-modified-since equals Last-Modified', async () => {
    const response = await makeRequest('mybundle.bundle?runModule=true');
    const lastModified = response.getHeader('Last-Modified');

    global.Date = class {
      // $FlowFixMe[missing-local-annot]
      constructor() {
        return new NativeDate('2017-07-07T00:10:20.000Z');
      }
      now(): number {
        return NativeDate.now();
      }
    };

    return makeRequest('mybundle.bundle?runModule=true', {
      headers: {'if-modified-since': lastModified},
    }).then(response => {
      expect(response.statusCode).toEqual(304);
    });
  });

  it('returns 200 on request of *.bundle when something changes (ignoring if-modified-since headers)', async () => {
    const response = await makeRequest('mybundle.bundle?runModule=true');
    const lastModified = response.getHeader('Last-Modified');

    getDelta.mockReturnValue(
      Promise.resolve({
        added: new Map<string, Module<>>(),
        modified: new Map<number, string>([
          [0, '__d(function() {entry();},0,[1],"mybundle.js");'],
        ]),
        deleted: new Set<string>(),
        reset: false,
      }),
    );

    global.Date = class {
      // $FlowFixMe[missing-local-annot]
      constructor() {
        return new NativeDate('2017-07-07T00:10:20.000Z');
      }
      now(): number {
        return NativeDate.now();
      }
    };

    return makeRequest('mybundle.bundle?runModule=true', {
      headers: {'if-modified-since': lastModified},
    }).then(response => {
      expect(response.statusCode).toEqual(200);
      expect(response.getHeader('X-Metro-Files-Changed-Count')).toEqual('1');
    });
  });

  it('supports the `modulesOnly` option', async () => {
    const response = await makeRequest(
      'mybundle.bundle?modulesOnly=true&runModule=false',
      null,
    );

    expect(response._getString()).toEqual(
      [
        '__d(function() {entry();},0,[1],"mybundle.js");',
        '__d(function() {foo();},1,[],"foo.js");',
        '//# sourceMappingURL=//localhost:8081/mybundle.map?modulesOnly=true&runModule=false',
        '//# sourceURL=http://localhost:8081/mybundle.bundle?modulesOnly=true&runModule=false',
      ].join('\n'),
    );
  });

  it('supports the `shallow` option', async () => {
    const response = await makeRequest(
      'mybundle.bundle?shallow=true&modulesOnly=true&runModule=false',
      null,
    );

    expect(response._getString()).toEqual(
      [
        '__d(function() {entry();},0,[1],"mybundle.js");',
        '//# sourceMappingURL=//localhost:8081/mybundle.map?shallow=true&modulesOnly=true&runModule=false',
        '//# sourceURL=http://localhost:8081/mybundle.bundle?shallow=true&modulesOnly=true&runModule=false',
      ].join('\n'),
    );
  });

  it('should handle DELETE requests on *.bundle', async () => {
    const IncrementalBundler = require('../../IncrementalBundler');
    const updateSpy = jest.spyOn(IncrementalBundler.prototype, 'updateGraph');
    const initSpy = jest.spyOn(IncrementalBundler.prototype, 'initializeGraph');

    // When building a bundle for the first time, we expect to create a graph for it.
    await makeRequest('mybundle.bundle', null);
    expect(initSpy).toBeCalledTimes(1);
    expect(updateSpy).not.toBeCalled();

    jest.clearAllMocks();

    // When building again, the graph should already exist and only need an update.
    await makeRequest('mybundle.bundle', null);
    expect(initSpy).not.toBeCalled();
    expect(updateSpy).toBeCalledTimes(1);

    jest.clearAllMocks();

    // `DELETE`ing the bundle evicts its graph data from memory and doesn't trigger init/update.
    const deleteResponse = await makeRequest('mybundle.bundle', {
      method: 'DELETE',
    });
    expect(deleteResponse.statusCode).toBe(204);
    expect(initSpy).not.toBeCalled();
    expect(updateSpy).not.toBeCalled();

    jest.clearAllMocks();

    // Building the bundle again reinitialises the graph.
    await makeRequest('mybundle.bundle');
    expect(initSpy).toBeCalledTimes(1);
    expect(updateSpy).not.toBeCalled();
  });

  it('multiple DELETE requests on *.bundle succeed', async () => {
    await makeRequest('mybundle.bundle', null);
    await makeRequest('mybundle.bundle', {
      method: 'DELETE',
    });
    const secondDeleteResponse = await makeRequest('mybundle.bundle', {
      method: 'DELETE',
    });
    expect(secondDeleteResponse.statusCode).toBe(204);
  });

  it('DELETE succeeds with a nonexistent path', async () => {
    // $FlowFixMe[cannot-write]
    fs.realpath = jest.fn((file, cb: $FlowFixMe) =>
      cb(new ResourceNotFoundError('unknown.bundle')),
    );

    const response = await makeRequest('unknown.bundle?runModule=true', {
      method: 'DELETE',
    });
    expect(response.statusCode).toEqual(204);
  });

  it('DELETE handles errors', async () => {
    const IncrementalBundler = require('../../IncrementalBundler');
    jest
      .spyOn(IncrementalBundler.prototype, 'endGraph')
      .mockImplementationOnce(async () => {
        throw new Error('endGraph error');
      });

    await makeRequest('mybundle.bundle', null);
    const response = await makeRequest('mybundle.bundle', {
      method: 'DELETE',
    });

    expect(response.statusCode).toEqual(500);
    expect(response._getJSON()).toEqual({
      errors: [],
      message: expect.any(String),
      type: 'InternalError',
    });
  });

  it('returns sourcemap on request of *.map', async () => {
    const response = await makeRequest('mybundle.map');

    expect(response._getJSON()).toEqual({
      version: 3,
      sources: ['require-js', '/root/mybundle.js', '/root/foo.js'],
      sourcesContent: ['code-require', 'code-mybundle', 'code-foo'],
      names: [],
      mappings: ';gBCAA;gBCAA',
      x_facebook_sources: [
        null,
        null,
        [
          {
            mappings: 'AAA',
            names: ['<global>'],
          },
        ],
      ],
    });
  });

  it('source map request respects `modulesOnly` option', async () => {
    const response = await makeRequest('mybundle.map?modulesOnly=true');

    expect(response._getJSON()).toEqual({
      version: 3,
      sources: ['/root/mybundle.js', '/root/foo.js'],
      sourcesContent: ['code-mybundle', 'code-foo'],
      names: [],
      mappings: 'gBAAA;gBCAA',
      x_facebook_sources: [
        null,
        [
          {
            mappings: 'AAA',
            names: ['<global>'],
          },
        ],
      ],
    });
  });

  it('does not rebuild the graph when requesting the sourcemaps after having requested the same bundle', async () => {
    expect((await makeRequest('mybundle.bundle?platform=ios')).statusCode).toBe(
      200,
    );

    buildGraph.mockClear();

    expect((await makeRequest('mybundle.map?platform=ios')).statusCode).toBe(
      200,
    );

    expect(buildGraph.mock.calls.length).toBe(0);
  });

  it('does build a delta when requesting the sourcemaps after having requested the same bundle', async () => {
    expect((await makeRequest('mybundle.bundle?platform=ios')).statusCode).toBe(
      200,
    );

    getDelta.mockClear();

    expect((await makeRequest('mybundle.map?platform=ios')).statusCode).toBe(
      200,
    );

    expect(getDelta.mock.calls.length).toBe(1);
  });

  it('does rebuild the graph when requesting the sourcemaps if the bundle has not been built yet', async () => {
    expect((await makeRequest('mybundle.bundle?platform=ios')).statusCode).toBe(
      200,
    );

    buildGraph.mockClear();
    getDelta.mockClear();

    // request the map of a different bundle
    expect(
      (await makeRequest('mybundle.map?platform=android')).statusCode,
    ).toBe(200);

    expect(buildGraph.mock.calls.length).toBe(1);
  });

  it('passes in the platform param', async () => {
    await makeRequest('index.bundle?platform=ios');

    expect(getTransformFn).toBeCalledWith(
      ['/root/index.js'],
      expect.any(Bundler),
      expect.any(DeltaBundler),
      expect.any(Object),
      expect.objectContaining({
        platform: 'ios',
      }),
      expect.any(Object),
    );
    expect(getResolveDependencyFn).toBeCalled();

    expect(buildGraph).toBeCalledWith(['/root/index.js'], {
      experimentalImportBundleSupport: false,
      onProgress: expect.any(Function),
      resolve: expect.any(Function),
      shallow: false,
      transform: expect.any(Function),
      transformOptions: {
        customTransformOptions: {},
        dev: true,
        hot: true,
        minify: false,
        platform: 'ios',
        runtimeBytecodeVersion: null,
        type: 'module',
        unstable_transformProfile: 'default',
      },
      unstable_allowRequireContext: false,
    });
  });

  it('passes in the unstable_transformProfile param', async () => {
    await makeRequest('index.bundle?unstable_transformProfile=hermes-stable');

    expect(getTransformFn).toBeCalledWith(
      ['/root/index.js'],
      expect.any(Bundler),
      expect.any(DeltaBundler),
      expect.any(Object),
      expect.objectContaining({
        unstable_transformProfile: 'hermes-stable',
      }),
      expect.any(Object),
    );
    expect(getResolveDependencyFn).toBeCalled();

    expect(buildGraph).toBeCalledWith(['/root/index.js'], {
      experimentalImportBundleSupport: false,
      onProgress: expect.any(Function),
      resolve: expect.any(Function),
      shallow: false,
      transform: expect.any(Function),
      transformOptions: {
        customTransformOptions: {},
        dev: true,
        hot: true,
        minify: false,
        platform: null,
        runtimeBytecodeVersion: null,
        type: 'module',
        unstable_transformProfile: 'hermes-stable',
      },
      unstable_allowRequireContext: false,
    });
  });

  it('rewrites URLs before bundling', async () => {
    const response = await makeRequest(
      'mybundle.bundle?runModule=true__REMOVE_THIS_WHEN_REWRITING__',
      null,
    );

    expect(response._getString()).toEqual(
      [
        'function () {require();}',
        '__d(function() {entry();},0,[1],"mybundle.js");',
        '__d(function() {foo();},1,[],"foo.js");',
        'require(0);',
        '//# sourceMappingURL=//localhost:8081/mybundle.map?runModule=true&TEST_URL_WAS_REWRITTEN=true',
        '//# sourceURL=http://localhost:8081/mybundle.bundle?runModule=true&TEST_URL_WAS_REWRITTEN=true',
      ].join('\n'),
    );
  });

  it('does not rebuild the bundle when making concurrent requests', async () => {
    // Delay the response of the buildGraph method.
    const promise1 = makeRequest('index.bundle');
    const promise2 = makeRequest('index.bundle');

    const [result1, result2] = await Promise.all([promise1, promise2]);
    expect(result1._getString()).toEqual(result2._getString());
    expect(result1.getHeader('X-Metro-Files-Changed-Count')).toEqual('3');
    expect(result2.getHeader('X-Metro-Files-Changed-Count')).toEqual('0');

    expect(buildGraph.mock.calls.length).toBe(1);
    expect(getDelta.mock.calls.length).toBe(1);
  });

  describe('/assets endpoint', () => {
    beforeEach(() => {
      jest.useRealTimers();
    });

    it('should serve simple case', async () => {
      getAsset.mockResolvedValue(Promise.resolve('i am image'));

      const response = await makeRequest('/assets/imgs/a.png');
      expect(response._getString()).toBe('i am image');
    });

    it('should parse the platform option', async () => {
      getAsset.mockResolvedValue(Promise.resolve('i am image'));

      const response = await makeRequest('/assets/imgs/a.png?platform=ios');
      expect(response._getString()).toBe('i am image');

      expect(getAsset).toBeCalledWith(
        'imgs/a.png',
        '/root',
        ['/root'],
        'ios',
        expect.any(Array),
      );
    });

    it('should serve range request', async () => {
      const mockData = 'i am image';
      getAsset.mockResolvedValue(mockData);

      const response = await makeRequest('/assets/imgs/a.png?platform=ios', {
        headers: {range: 'bytes=0-3'},
      });

      expect(getAsset).toBeCalledWith(
        'imgs/a.png',
        '/root',
        ['/root'],
        'ios',
        expect.any(Array),
      );
      expect(response._getString()).toBe(mockData.slice(0, 4));
    });

    it("should serve assets files's name contain non-latin letter", async () => {
      getAsset.mockResolvedValue('i am image');

      const response = await makeRequest(
        '/assets/imgs/%E4%B8%BB%E9%A1%B5/logo.png',
      );
      expect(response._getString()).toBe('i am image');

      expect(getAsset).toBeCalledWith(
        'imgs/\u{4E3B}\u{9875}/logo.png',
        '/root',
        ['/root'],
        undefined,
        expect.any(Array),
      );
    });

    it('should use unstable_path if provided', async () => {
      getAsset.mockResolvedValue('i am image');

      const response = await makeRequest('/assets?unstable_path=imgs/a.png');

      expect(response._getString()).toBe('i am image');
    });

    it('should parse the platform option if tacked onto unstable_path', async () => {
      getAsset.mockResolvedValue('i am image');

      const response = await makeRequest(
        '/assets?unstable_path=imgs/a.png?platform=ios',
      );

      expect(getAsset).toBeCalledWith(
        'imgs/a.png',
        '/root',
        ['/root'],
        'ios',
        expect.any(Array),
      );
      expect(response._getString()).toBe('i am image');
    });

    it('unstable_path can escape from projectRoot', async () => {
      getAsset.mockResolvedValue('i am image');

      const response = await makeRequest(
        '/assets?unstable_path=../otherFolder/otherImage.png',
      );

      expect(getAsset).toBeCalledWith(
        '../otherFolder/otherImage.png',
        '/root',
        ['/root'],
        undefined,
        expect.any(Array),
      );
      expect(response._getString()).toBe('i am image');
    });
  });

  describe('build(options)', () => {
    it('Calls the delta bundler with the correct args', async () => {
      await server.build({
        ...Server.DEFAULT_BUNDLE_OPTIONS,
        entryFile: 'foo file',
        bundleType: 'bundle',
        platform: undefined,
      });

      expect(getTransformFn).toBeCalledWith(
        ['/root/foo file'],
        expect.any(Bundler),
        expect.any(DeltaBundler),
        expect.any(Object),
        {
          customTransformOptions: {},
          dev: true,
          hot: false,
          minify: false,
          platform: undefined,
          runtimeBytecodeVersion: null,
          type: 'module',
          unstable_transformProfile: 'default',
        },
        expect.any(Object),
      );
      expect(getResolveDependencyFn).toBeCalled();

      expect(buildGraph).toBeCalledWith(['/root/foo file'], {
        experimentalImportBundleSupport: false,
        onProgress: null,
        resolve: expect.any(Function),
        shallow: false,
        transform: expect.any(Function),
        transformOptions: {
          customTransformOptions: {},
          dev: true,
          hot: false,
          minify: false,
          platform: undefined,
          runtimeBytecodeVersion: null,
          type: 'module',
          unstable_transformProfile: 'default',
        },
        unstable_allowRequireContext: false,
      });
    });
  });

  describe('/symbolicate endpoint', () => {
    beforeEach(() => {
      fs.mkdirSync('/root');
      fs.writeFileSync(
        '/root/mybundle.js',
        'this\nis\njust an example and it is all fake data, yay!',
      );
    });

    it('should symbolicate given stack trace', async () => {
      const response = await makeRequest('/symbolicate', {
        rawBody: JSON.stringify({
          stack: [
            {
              file: 'http://localhost:8081/mybundle.bundle?runModule=true',
              lineNumber: 2,
              column: 18,
              customPropShouldBeLeftUnchanged: 'foo',
              methodName: 'clientSideMethodName',
            },
          ],
        }),
      });

      expect(response._getJSON()).toMatchInlineSnapshot(`
        Object {
          "codeFrame": Object {
            "content": "[0m[31m[1m>[22m[39m[90m 1 |[39m [36mthis[39m[0m
        [0m [90m   |[39m [31m[1m^[22m[39m[0m
        [0m [90m 2 |[39m is[0m
        [0m [90m 3 |[39m just an example and it is all fake data[33m,[39m yay[33m![39m[0m",
            "fileName": "/root/mybundle.js",
            "location": Object {
              "column": 0,
              "row": 1,
            },
          },
          "stack": Array [
            Object {
              "collapse": false,
              "column": 0,
              "customPropShouldBeLeftUnchanged": "foo",
              "file": "/root/mybundle.js",
              "lineNumber": 1,
              "methodName": "clientSideMethodName",
            },
          ],
        }
      `);
    });

    describe('should rewrite URLs before symbolicating', () => {
      test('mapped location symbolicates correctly', async () => {
        const mappedLocation = {
          lineNumber: 2,
          column: 18,
          customPropShouldBeLeftUnchanged: 'foo',
          methodName: 'clientSideMethodName',
        };

        const response = await makeRequest('/symbolicate', {
          rawBody: JSON.stringify({
            stack: [
              {
                file: 'http://localhost:8081/my__REMOVE_THIS_WHEN_REWRITING__bundle.bundle?runModule=true',
                ...mappedLocation,
              },
            ],
          }),
        });

        expect(response._getJSON()).toEqual(
          JSON.parse(
            (
              await makeRequest('/symbolicate', {
                rawBody: JSON.stringify({
                  stack: [
                    {
                      file: 'http://localhost:8081/mybundle.bundle?runModule=true',
                      ...mappedLocation,
                    },
                  ],
                }),
              })
            )._getString(),
          ),
        );
      });

      test('unmapped location returns the rewritten URL', async () => {
        const unmappedLocation = {
          lineNumber: 200000,
          column: 18,
          customPropShouldBeLeftUnchanged: 'foo',
          methodName: 'clientSideMethodName',
        };

        const response = await makeRequest('/symbolicate', {
          rawBody: JSON.stringify({
            stack: [
              {
                file: 'http://localhost:8081/my__REMOVE_THIS_WHEN_REWRITING__bundle.bundle?runModule=true',
                ...unmappedLocation,
              },
            ],
          }),
        });

        expect(response._getJSON().stack[0].file).toBe(
          'http://localhost:8081/mybundle.bundle?runModule=true&TEST_URL_WAS_REWRITTEN=true',
        );
      });
    });

    it('should update the graph when symbolicating a second time', async () => {
      const requestData = {
        rawBody: JSON.stringify({
          stack: [
            {
              file: 'http://localhost:8081/mybundle.bundle?runModule=true',
              lineNumber: 2,
              column: 18,
              customPropShouldBeLeftUnchanged: 'foo',
              methodName: 'clientSideMethodName',
            },
          ],
        }),
      };

      const IncrementalBundler = require('../../IncrementalBundler');
      const updateSpy = jest.spyOn(IncrementalBundler.prototype, 'updateGraph');
      const initSpy = jest.spyOn(
        IncrementalBundler.prototype,
        'initializeGraph',
      );

      // When symbolicating a bundle the first time, we expect to create a graph for it.
      await makeRequest('/symbolicate', requestData);
      expect(initSpy).toBeCalledTimes(1);
      expect(updateSpy).not.toBeCalled();

      // When symbolicating the same bundle a second time, the bundle graph may be out of date.
      // Let's be sure to update the bundle graph.
      await makeRequest('/symbolicate', requestData);
      expect(initSpy).toBeCalledTimes(1);
      expect(updateSpy).toBeCalledTimes(1);
    });

    it('supports the `modulesOnly` option', async () => {
      const response = await makeRequest('/symbolicate', {
        rawBody: JSON.stringify({
          stack: [
            {
              file: 'http://localhost:8081/mybundle.bundle?runModule=true&modulesOnly=true',
              lineNumber: 2,
              column: 16,
            },
          ],
        }),
      });

      expect(response._getJSON()).toMatchObject({
        stack: [
          expect.objectContaining({
            column: 0,
            file: '/root/foo.js',
            lineNumber: 1,
          }),
        ],
      });
    });

    it('supports the `shallow` option', async () => {
      const response = await makeRequest('/symbolicate', {
        rawBody: JSON.stringify({
          stack: [
            {
              file: 'http://localhost:8081/mybundle.bundle?runModule=true&shallow=true',
              lineNumber: 2,
              column: 18,
              customPropShouldBeLeftUnchanged: 'foo',
              methodName: 'clientSideMethodName',
            },
          ],
        }),
      });

      expect(response._getJSON()).toMatchInlineSnapshot(`
        Object {
          "codeFrame": Object {
            "content": "[0m[31m[1m>[22m[39m[90m 1 |[39m [36mthis[39m[0m
        [0m [90m   |[39m [31m[1m^[22m[39m[0m
        [0m [90m 2 |[39m is[0m
        [0m [90m 3 |[39m just an example and it is all fake data[33m,[39m yay[33m![39m[0m",
            "fileName": "/root/mybundle.js",
            "location": Object {
              "column": 0,
              "row": 1,
            },
          },
          "stack": Array [
            Object {
              "collapse": false,
              "column": 0,
              "customPropShouldBeLeftUnchanged": "foo",
              "file": "/root/mybundle.js",
              "lineNumber": 1,
              "methodName": "clientSideMethodName",
            },
          ],
        }
      `);
    });

    it('should symbolicate function name if available', async () => {
      const response = await makeRequest('/symbolicate', {
        rawBody: JSON.stringify({
          stack: [
            {
              file: 'http://localhost:8081/mybundle.bundle?runModule=true',
              lineNumber: 3,
              column: 18,
            },
          ],
        }),
      });

      expect(response._getJSON()).toMatchObject({
        stack: [
          expect.objectContaining({
            methodName: '<global>',
          }),
        ],
      });
    });

    it('should collapse frames as specified in customizeFrame', async () => {
      // NOTE: See implementation of symbolicator.customizeFrame above.

      const response = await makeRequest('/symbolicate', {
        rawBody: JSON.stringify({
          stack: [
            {
              file: 'http://localhost:8081/mybundle.bundle?runModule=true',
              lineNumber: 3,
              column: 18,
            },
          ],
        }),
      });

      expect(response._getJSON()).toMatchObject({
        stack: [
          expect.objectContaining({
            file: '/root/foo.js',
            collapse: true,
          }),
        ],
      });
    });

    it('should leave original file and position when cannot symbolicate', async () => {
      const response = await makeRequest('/symbolicate', {
        rawBody: JSON.stringify({
          stack: [
            {
              file: 'http://localhost:8081/mybundle.bundle?runModule=true',
              lineNumber: 200,
              column: 18,
              customPropShouldBeLeftUnchanged: 'foo',
              methodName: 'clientSideMethodName',
            },
          ],
        }),
      });

      expect(response._getJSON()).toMatchInlineSnapshot(`
        Object {
          "codeFrame": null,
          "stack": Array [
            Object {
              "collapse": false,
              "column": 18,
              "customPropShouldBeLeftUnchanged": "foo",
              "file": "http://localhost:8081/mybundle.bundle?runModule=true",
              "lineNumber": 200,
              "methodName": "clientSideMethodName",
            },
          ],
        }
      `);
    });
  });

  describe('/symbolicate handles errors', () => {
    it('should symbolicate given stack trace', async () => {
      const body = 'clearly-not-json';
      // $FlowFixMe[cannot-write]
      console.error = jest.fn();

      const response = await makeRequest('/symbolicate', {
        rawBody: body,
      });
      expect(response.statusCode).toEqual(500);
      expect(response._getJSON()).toEqual({
        error: expect.any(String),
      });
      expect(console.error).toBeCalled();
    });
  });
});
