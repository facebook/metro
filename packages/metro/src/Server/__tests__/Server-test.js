/**
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @emails oncall+metro_bundler
 * @format
 */

'use strict';

const ResourceNotFoundError = require('../../IncrementalBundler/ResourceNotFoundError');

const path = require('path');

const {MAGIC_NUMBER} = require('../../lib/bundleToBytecode');
const {getDefaultValues} = require('metro-config/src/defaults');
const {
  compile,
  align,
  validateBytecodeModule,
  VERSION: BYTECODE_VERSION,
} = require('metro-hermes-compiler');

jest
  .mock('jest-worker', () => ({}))
  .mock('crypto')
  .mock('fs')
  .mock('../../Bundler')
  .mock('../../DeltaBundler')
  .mock('../../Assets')
  .mock('../../node-haste/DependencyGraph')
  .mock('metro-core/src/Logger')
  .mock('../../lib/getPrependedScripts')
  .mock('../../lib/transformHelpers');

const NativeDate = global.Date;

describe('processRequest', () => {
  let Bundler;
  let Server;
  let crypto;
  let dependencies;
  let fs;
  let getAsset;
  let getPrependedScripts;
  let transformHelpers;
  let DeltaBundler;

  beforeEach(() => {
    jest.useFakeTimers();
    jest.resetModules();

    global.Date = NativeDate;

    Bundler = require('../../Bundler');
    crypto = require('crypto');
    jest.mock('fs', () => new (require('metro-memory-fs'))());
    fs = require('fs');
    getAsset = require('../../Assets').getAsset;
    getPrependedScripts = require('../../lib/getPrependedScripts');
    transformHelpers = require('../../lib/transformHelpers');
    DeltaBundler = require('../../DeltaBundler');
    Server = require('../../Server');
  });

  let server;

  const config = getDefaultValues('/');
  config.projectRoot = '/root';
  config.watchFolders = ['/root'];
  config.resolver.blockList = null;
  config.cacheVersion = null;
  config.serializer.getRunModuleStatement = moduleId =>
    `require(${JSON.stringify(moduleId)});`;
  config.reporter = require('../../lib/reporting').nullReporter;
  config.serializer.polyfillModuleNames = null;
  config.serializer.getModulesRunBeforeMainModule = () => ['InitializeCore'];
  config.server.rewriteRequestUrl = function(requrl) {
    const rewritten = requrl.replace(/__REMOVE_THIS_WHEN_REWRITING__/g, '');
    if (rewritten !== requrl) {
      return rewritten + '&TEST_URL_WAS_REWRITTEN=true';
    }
    return requrl;
  };
  config.symbolicator.customizeFrame = ({file}) => {
    if (file === '/root/foo.js') {
      return {collapse: true};
    }
    return null;
  };

  const makeRequest = (requrl, reqOptions) =>
    new Promise((resolve, reject) =>
      server.processRequest(
        {url: requrl, headers: {host: 'localhost:8081'}, ...reqOptions},
        {
          statusCode: 200,
          headers: {},
          getHeader(header) {
            return this.headers[header];
          },
          setHeader(header, value) {
            this.headers[header] = value;
          },
          writeHead(statusCode) {
            this.statusCode = statusCode;
          },
          end(body) {
            this.body = body;
            resolve(this);
          },
        },
        reject,
      ),
    );

  beforeEach(() => {
    const currentGraphs = new Set();
    DeltaBundler.prototype.buildGraph.mockImplementation(
      async (entryPoints, options) => {
        dependencies = new Map([
          [
            '/root/mybundle.js',
            {
              path: '/root/mybundle.js',
              dependencies: new Map([
                [
                  'foo',
                  {
                    absolutePath: '/root/foo.js',
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

        const graph = {
          entryPoints: ['/root/mybundle.js'],
          dependencies,
          importBundleNames: new Set(),
        };
        currentGraphs.add(graph);

        return graph;
      },
    );
    DeltaBundler.prototype.getDelta.mockImplementation(
      async (graph, {reset}) => {
        if (!currentGraphs.has(graph)) {
          throw new Error('Graph not found');
        }

        return {
          added: reset ? dependencies : new Map(),
          modified: new Map(),
          deleted: new Set(),
          reset,
        };
      },
    );

    getPrependedScripts.mockReturnValue(
      Promise.resolve([
        {
          path: 'require-js',
          dependencies: new Map(),
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

    Bundler.prototype.getDependencyGraph = jest.fn().mockReturnValue(
      Promise.resolve({
        getHasteMap: jest.fn().mockReturnValue({on: jest.fn()}),
        load: jest.fn(() => Promise.resolve()),
        getWatcher: jest.fn(() => ({})),
      }),
    );

    server = new Server(config);

    transformHelpers.getTransformFn = jest.fn().mockReturnValue(() => {});
    transformHelpers.getResolveDependencyFn = jest
      .fn()
      .mockReturnValue((a, b) => path.resolve(a, `${b}.js`));
    let i = 0;
    crypto.randomBytes.mockImplementation(() => `XXXXX-${i++}`);

    fs.realpath = jest.fn((file, cb) => cb(null, '/root/foo.js'));
  });

  it('returns JS bundle source on request of *.bundle', async () => {
    const response = await makeRequest('mybundle.bundle?runModule=true', null);

    expect(response.body).toEqual(
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

    const buffer = response.body;
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

    expect(response.body).toEqual(
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
        '' + Buffer.byteLength(response.body),
      );
    });
  });

  it('returns 404 on request of *.bundle when resource does not exist', async () => {
    fs.realpath = jest.fn((file, cb) =>
      cb(new ResourceNotFoundError('unknown.bundle')),
    );

    return makeRequest('unknown.bundle?runModule=true').then(response => {
      expect(response.statusCode).toEqual(404);
      expect(response.body).toEqual(
        expect.stringContaining('ResourceNotFoundError'),
      );
    });
  });

  it('returns 304 on request of *.bundle when if-modified-since equals Last-Modified', async () => {
    const response = await makeRequest('mybundle.bundle?runModule=true');
    const lastModified = response.headers['Last-Modified'];

    global.Date = class {
      constructor() {
        return new NativeDate('2017-07-07T00:10:20.000Z');
      }
      now() {
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
    const lastModified = response.headers['Last-Modified'];

    DeltaBundler.prototype.getDelta.mockReturnValue(
      Promise.resolve({
        added: new Map(),
        modified: new Map([
          [0, '__d(function() {entry();},0,[1],"mybundle.js");'],
        ]),
        deleted: new Set(),
        reset: false,
      }),
    );

    global.Date = class {
      constructor() {
        return new NativeDate('2017-07-07T00:10:20.000Z');
      }
      now() {
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

    expect(response.body).toEqual(
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

    expect(response.body).toEqual(
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
    fs.realpath = jest.fn((file, cb) =>
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
    expect(JSON.parse(response.body)).toEqual({
      errors: [],
      message: expect.any(String),
      type: 'InternalError',
    });
  });

  it('returns sourcemap on request of *.map', async () => {
    const response = await makeRequest('mybundle.map');

    expect(JSON.parse(response.body)).toEqual({
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

    expect(JSON.parse(response.body)).toEqual({
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

    DeltaBundler.prototype.buildGraph.mockClear();

    expect((await makeRequest('mybundle.map?platform=ios')).statusCode).toBe(
      200,
    );

    expect(DeltaBundler.prototype.buildGraph.mock.calls.length).toBe(0);
  });

  it('does build a delta when requesting the sourcemaps after having requested the same bundle', async () => {
    expect((await makeRequest('mybundle.bundle?platform=ios')).statusCode).toBe(
      200,
    );

    DeltaBundler.prototype.getDelta.mockClear();

    expect((await makeRequest('mybundle.map?platform=ios')).statusCode).toBe(
      200,
    );

    expect(DeltaBundler.prototype.getDelta.mock.calls.length).toBe(1);
  });

  it('does rebuild the graph when requesting the sourcemaps if the bundle has not been built yet', async () => {
    expect((await makeRequest('mybundle.bundle?platform=ios')).statusCode).toBe(
      200,
    );

    DeltaBundler.prototype.buildGraph.mockClear();
    DeltaBundler.prototype.getDelta.mockClear();

    // request the map of a different bundle
    expect(
      (await makeRequest('mybundle.map?platform=android')).statusCode,
    ).toBe(200);

    expect(DeltaBundler.prototype.buildGraph.mock.calls.length).toBe(1);
  });

  it('passes in the platform param', async () => {
    await makeRequest('index.bundle?platform=ios');

    expect(transformHelpers.getTransformFn).toBeCalledWith(
      ['/root/index.js'],
      expect.any(Bundler),
      expect.any(DeltaBundler),
      expect.any(Object),
      expect.objectContaining({
        platform: 'ios',
      }),
    );
    expect(transformHelpers.getResolveDependencyFn).toBeCalled();

    expect(DeltaBundler.prototype.buildGraph).toBeCalledWith(
      ['/root/index.js'],
      {
        experimentalImportBundleSupport: false,
        onProgress: expect.any(Function),
        resolve: expect.any(Function),
        shallow: false,
        transform: expect.any(Function),
      },
    );
  });

  it('passes in the unstable_transformProfile param', async () => {
    await makeRequest('index.bundle?unstable_transformProfile=hermes-stable');

    expect(transformHelpers.getTransformFn).toBeCalledWith(
      ['/root/index.js'],
      expect.any(Bundler),
      expect.any(DeltaBundler),
      expect.any(Object),
      expect.objectContaining({
        unstable_transformProfile: 'hermes-stable',
      }),
    );
    expect(transformHelpers.getResolveDependencyFn).toBeCalled();

    expect(DeltaBundler.prototype.buildGraph).toBeCalledWith(
      ['/root/index.js'],
      {
        experimentalImportBundleSupport: false,
        onProgress: expect.any(Function),
        resolve: expect.any(Function),
        shallow: false,
        transform: expect.any(Function),
      },
    );
  });

  it('rewrites URLs before bundling', async () => {
    const response = await makeRequest(
      'mybundle.bundle?runModule=true__REMOVE_THIS_WHEN_REWRITING__',
      null,
    );

    expect(response.body).toEqual(
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
    expect(result1.body).toEqual(result2.body);
    expect(result1.getHeader('X-Metro-Files-Changed-Count')).toEqual('3');
    expect(result2.getHeader('X-Metro-Files-Changed-Count')).toEqual('0');

    expect(DeltaBundler.prototype.buildGraph.mock.calls.length).toBe(1);
    expect(DeltaBundler.prototype.getDelta.mock.calls.length).toBe(1);
  });

  describe('/assets endpoint', () => {
    beforeEach(() => {
      jest.useRealTimers();
    });

    it('should serve simple case', done => {
      const req = scaffoldReq({url: '/assets/imgs/a.png'});
      const res = {end: jest.fn(), setHeader: jest.fn()};

      getAsset.mockReturnValue(Promise.resolve('i am image'));

      server.processRequest(req, res);
      res.end.mockImplementation(value => {
        expect(value).toBe('i am image');
        done();
      });
    });

    it('should parse the platform option', done => {
      const req = scaffoldReq({url: '/assets/imgs/a.png?platform=ios'});
      const res = {end: jest.fn(), setHeader: jest.fn()};

      getAsset.mockReturnValue(Promise.resolve('i am image'));

      server.processRequest(req, res);
      res.end.mockImplementation(value => {
        expect(getAsset).toBeCalledWith(
          'imgs/a.png',
          '/root',
          ['/root'],
          'ios',
          expect.any(Array),
        );
        expect(value).toBe('i am image');
        done();
      });
    });

    it('should serve range request', done => {
      const req = scaffoldReq({
        url: '/assets/imgs/a.png?platform=ios',
        headers: {range: 'bytes=0-3'},
      });
      const res = {end: jest.fn(), writeHead: jest.fn(), setHeader: jest.fn()};
      const mockData = 'i am image';

      getAsset.mockReturnValue(Promise.resolve(mockData));

      server.processRequest(req, res);
      res.end.mockImplementation(value => {
        expect(getAsset).toBeCalledWith(
          'imgs/a.png',
          '/root',
          ['/root'],
          'ios',
          expect.any(Array),
        );
        expect(value).toBe(mockData.slice(0, 4));
        done();
      });
    });

    it("should serve assets files's name contain non-latin letter", done => {
      const req = scaffoldReq({
        url: '/assets/imgs/%E4%B8%BB%E9%A1%B5/logo.png',
      });
      const res = {end: jest.fn(), setHeader: jest.fn()};

      getAsset.mockReturnValue(Promise.resolve('i am image'));

      server.processRequest(req, res);
      res.end.mockImplementation(value => {
        expect(getAsset).toBeCalledWith(
          'imgs/\u{4E3B}\u{9875}/logo.png',
          '/root',
          ['/root'],
          undefined,
          expect.any(Array),
        );
        expect(value).toBe('i am image');
        done();
      });
    });
  });

  describe('build(options)', () => {
    it('Calls the delta bundler with the correct args', async () => {
      await server.build({
        ...Server.DEFAULT_BUNDLE_OPTIONS,
        entryFile: 'foo file',
      });

      expect(transformHelpers.getTransformFn).toBeCalledWith(
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
      );
      expect(transformHelpers.getResolveDependencyFn).toBeCalled();

      expect(DeltaBundler.prototype.buildGraph).toBeCalledWith(
        ['/root/foo file'],
        {
          experimentalImportBundleSupport: false,
          onProgress: null,
          resolve: expect.any(Function),
          shallow: false,
          transform: expect.any(Function),
        },
      );
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

      expect(JSON.parse(response.body)).toMatchInlineSnapshot(`
        Object {
          "codeFrame": Object {
            "content": "[0m[31m[1m>[22m[39m[90m 1 | [39m[36mthis[39m[0m
        [0m [90m   | [39m[31m[1m^[22m[39m[0m
        [0m [90m 2 | [39mis[0m
        [0m [90m 3 | [39mjust an example and it is all fake data[33m,[39m yay[33m![39m[0m",
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
                file:
                  'http://localhost:8081/my__REMOVE_THIS_WHEN_REWRITING__bundle.bundle?runModule=true',
                ...mappedLocation,
              },
            ],
          }),
        });

        expect(JSON.parse(response.body)).toEqual(
          JSON.parse(
            (
              await makeRequest('/symbolicate', {
                rawBody: JSON.stringify({
                  stack: [
                    {
                      file:
                        'http://localhost:8081/mybundle.bundle?runModule=true',
                      ...mappedLocation,
                    },
                  ],
                }),
              })
            ).body,
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
                file:
                  'http://localhost:8081/my__REMOVE_THIS_WHEN_REWRITING__bundle.bundle?runModule=true',
                ...unmappedLocation,
              },
            ],
          }),
        });

        expect(JSON.parse(response.body).stack[0].file).toBe(
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
              file:
                'http://localhost:8081/mybundle.bundle?runModule=true&modulesOnly=true',
              lineNumber: 2,
              column: 16,
            },
          ],
        }),
      });

      expect(JSON.parse(response.body)).toMatchObject({
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
              file:
                'http://localhost:8081/mybundle.bundle?runModule=true&shallow=true',
              lineNumber: 2,
              column: 18,
              customPropShouldBeLeftUnchanged: 'foo',
              methodName: 'clientSideMethodName',
            },
          ],
        }),
      });

      expect(JSON.parse(response.body)).toMatchInlineSnapshot(`
        Object {
          "codeFrame": Object {
            "content": "[0m[31m[1m>[22m[39m[90m 1 | [39m[36mthis[39m[0m
        [0m [90m   | [39m[31m[1m^[22m[39m[0m
        [0m [90m 2 | [39mis[0m
        [0m [90m 3 | [39mjust an example and it is all fake data[33m,[39m yay[33m![39m[0m",
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

      expect(JSON.parse(response.body)).toMatchObject({
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

      expect(JSON.parse(response.body)).toMatchObject({
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

      expect(JSON.parse(response.body)).toMatchInlineSnapshot(`
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
      console.error = jest.fn();

      const response = await makeRequest('/symbolicate', {
        rawBody: body,
      });
      expect(response.statusCode).toEqual(500);
      expect(JSON.parse(response.body)).toEqual({
        error: expect.any(String),
      });
      expect(console.error).toBeCalled();
    });
  });

  // ensures that vital properties exist on fake request objects
  function scaffoldReq(req) {
    if (!req.headers) {
      req.headers = {};
    }
    return req;
  }
});
