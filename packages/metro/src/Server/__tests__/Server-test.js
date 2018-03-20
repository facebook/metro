/**
 * Copyright (c) 2015-present, Facebook, Inc.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @emails oncall+javascript_foundation
 * @format
 */

'use strict';

jest
  .mock('jest-worker', () => ({}))
  .mock('metro-minify-uglify')
  .mock('crypto')
  .mock('../symbolicate/symbolicate', () => ({
    createWorker: jest.fn().mockReturnValue(jest.fn()),
  }))
  .mock('../../Bundler')
  .mock('../../DeltaBundler')
  .mock('../../Assets')
  .mock('../../node-haste/DependencyGraph')
  .mock('metro-core/src/Logger')
  .mock('../../lib/getAbsolutePath')
  .mock('../../lib/getPrependedScripts')
  .mock('../../lib/GlobalTransformCache');

const NativeDate = global.Date;

describe('processRequest', () => {
  let Bundler;
  let Server;
  let crypto;
  let getAsset;
  let getPrependedScripts;
  let symbolicate;
  let DeltaBundler;

  beforeEach(() => {
    jest.useFakeTimers();
    jest.resetModules();

    global.Date = NativeDate;

    Bundler = require('../../Bundler');
    Server = require('../');
    crypto = require('crypto');
    getAsset = require('../../Assets').getAsset;
    getPrependedScripts = require('../../lib/getPrependedScripts');
    symbolicate = require('../symbolicate/symbolicate');
    DeltaBundler = require('../../DeltaBundler');
  });

  let server;

  const options = {
    projectRoots: ['/root'],
    blacklistRE: null,
    cacheVersion: null,
    polyfillModuleNames: null,
    reporter: require('../../lib/reporting').nullReporter,
    getModulesRunBeforeMainModule: () => ['InitializeCore'],
  };

  const makeRequest = (reqHandler, requrl, reqOptions) =>
    new Promise(resolve =>
      reqHandler(
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
        {next: () => {}},
      ),
    );

  let requestHandler;

  beforeEach(() => {
    DeltaBundler.prototype.buildGraph.mockReturnValue(
      Promise.resolve({
        entryPoints: ['/root/mybundle.js'],
        dependencies: new Map([
          [
            '/root/mybundle.js',
            {
              path: '/root/mybundle.js',
              dependencies: new Map([['foo', '/root/foo.js']]),
              output: {
                code: '__d(function() {entry();});',
                map: [],
                source: 'code-mybundle',
              },
            },
          ],
          [
            '/root/foo.js',
            {
              path: '/root/foo.js',
              dependencies: new Map(),
              output: {
                code: '__d(function() {foo();});',
                map: [],
                source: 'code-foo',
              },
            },
          ],
        ]),
      }),
    );

    getPrependedScripts.mockReturnValue(
      Promise.resolve([
        {
          path: 'require-js',
          dependencies: new Map(),
          output: {
            code: 'function () {require();}',
            map: [],
            type: 'script',
            source: 'code-require',
          },
        },
      ]),
    );

    Bundler.prototype.getDependencyGraph = jest.fn().mockReturnValue(
      Promise.resolve({
        getHasteMap: jest.fn().mockReturnValue({on: jest.fn()}),
        load: jest.fn(() => Promise.resolve()),
      }),
    );

    server = new Server(options);
    requestHandler = server.processRequest.bind(server);

    let i = 0;
    crypto.randomBytes.mockImplementation(() => `XXXXX-${i++}`);
  });

  it('returns JS bundle source on request of *.bundle', async () => {
    const response = await makeRequest(
      requestHandler,
      'mybundle.bundle?runModule=true',
      null,
    );

    expect(response.body).toEqual(
      [
        'function () {require();}',
        '__d(function() {entry();},0,[1],"mybundle.js");',
        '__d(function() {foo();},1,[],"foo.js");',
        'require(0);',
        '//# sourceMappingURL=http://localhost:8081/mybundle.map?runModule=true',
      ].join('\n'),
    );
  });

  it('returns JS bundle without the initial require() call', async () => {
    const response = await makeRequest(
      requestHandler,
      'mybundle.bundle?runModule=false',
      null,
    );

    expect(response.body).toEqual(
      [
        'function () {require();}',
        '__d(function() {entry();},0,[1],"mybundle.js");',
        '__d(function() {foo();},1,[],"foo.js");',
        '//# sourceMappingURL=http://localhost:8081/mybundle.map?runModule=false',
      ].join('\n'),
    );
  });

  it('returns Last-Modified header on request of *.bundle', () => {
    return makeRequest(requestHandler, 'mybundle.bundle?runModule=true').then(
      response => {
        expect(response.getHeader('Last-Modified')).toBeDefined();
      },
    );
  });

  it('returns build info headers on request of *.bundle', async () => {
    const response = await makeRequest(
      requestHandler,
      'mybundle.bundle?runModule=true',
    );

    expect(response.getHeader('X-Metro-Files-Changed-Count')).toEqual('3');
  });

  it('returns Content-Length header on request of *.bundle', () => {
    return makeRequest(requestHandler, 'mybundle.bundle?runModule=true').then(
      response => {
        expect(response.getHeader('Content-Length')).toEqual(
          '' + Buffer.byteLength(response.body),
        );
      },
    );
  });

  it('returns 304 on request of *.bundle when if-modified-since equals Last-Modified', async () => {
    const response = await makeRequest(
      requestHandler,
      'mybundle.bundle?runModule=true',
    );
    const lastModified = response.headers['Last-Modified'];

    DeltaBundler.prototype.getDelta.mockReturnValue(
      Promise.resolve({
        modified: new Map(),
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

    return makeRequest(requestHandler, 'mybundle.bundle?runModule=true', {
      headers: {'if-modified-since': lastModified},
    }).then(response => {
      expect(response.statusCode).toEqual(304);
    });
  });

  it('returns 200 on request of *.bundle when something changes (ignoring if-modified-since headers)', async () => {
    const response = await makeRequest(
      requestHandler,
      'mybundle.bundle?runModule=true',
    );
    const lastModified = response.headers['Last-Modified'];

    DeltaBundler.prototype.getDelta.mockReturnValue(
      Promise.resolve({
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

    return makeRequest(requestHandler, 'mybundle.bundle?runModule=true', {
      headers: {'if-modified-since': lastModified},
    }).then(response => {
      expect(response.statusCode).toEqual(200);
      expect(response.getHeader('X-Metro-Files-Changed-Count')).toEqual('1');
    });
  });

  it('returns sourcemap on request of *.map', async () => {
    const response = await makeRequest(requestHandler, 'mybundle.map');

    expect(JSON.parse(response.body)).toEqual({
      version: 3,
      sources: ['require-js', '/root/mybundle.js', '/root/foo.js'],
      sourcesContent: ['code-require', 'code-mybundle', 'code-foo'],
      names: [],
      mappings: '',
    });
  });

  it('does not rebuild the graph when requesting the sourcemaps after having requested the same bundle', async () => {
    expect(
      (await makeRequest(requestHandler, 'mybundle.bundle?platform=ios'))
        .statusCode,
    ).toBe(200);

    DeltaBundler.prototype.buildGraph.mockClear();
    DeltaBundler.prototype.getDelta.mockClear();

    expect(
      (await makeRequest(requestHandler, 'mybundle.map?platform=ios'))
        .statusCode,
    ).toBe(200);

    expect(DeltaBundler.prototype.buildGraph.mock.calls.length).toBe(0);
    expect(DeltaBundler.prototype.getDelta.mock.calls.length).toBe(0);
  });

  it('does rebuild the graph when requesting the sourcemaps if the bundle has not been built yet', async () => {
    expect(
      (await makeRequest(requestHandler, 'mybundle.bundle?platform=ios'))
        .statusCode,
    ).toBe(200);

    DeltaBundler.prototype.buildGraph.mockClear();
    DeltaBundler.prototype.getDelta.mockClear();

    // request the map of a different bundle
    expect(
      (await makeRequest(requestHandler, 'mybundle.map?platform=android'))
        .statusCode,
    ).toBe(200);

    expect(DeltaBundler.prototype.buildGraph.mock.calls.length).toBe(1);
  });

  it('works with .ios.js extension', () => {
    return makeRequest(requestHandler, 'index.ios.includeRequire.bundle').then(
      response => {
        expect(DeltaBundler.prototype.buildGraph).toBeCalledWith({
          assetPlugins: [],
          customTransformOptions: {},
          dev: true,
          entryPoints: ['/root/index.ios.js'],
          hot: true,
          minify: false,
          onProgress: jasmine.any(Function),
          platform: null,
          type: 'module',
        });
      },
    );
  });

  it('passes in the platform param', function() {
    return makeRequest(requestHandler, 'index.bundle?platform=ios').then(
      function(response) {
        expect(DeltaBundler.prototype.buildGraph).toBeCalledWith({
          assetPlugins: [],
          customTransformOptions: {},
          dev: true,
          entryPoints: ['/root/index.js'],
          hot: true,
          minify: false,
          onProgress: jasmine.any(Function),
          platform: 'ios',
          type: 'module',
        });
      },
    );
  });

  it('passes in the assetPlugin param', function() {
    return makeRequest(
      requestHandler,
      'index.bundle?assetPlugin=assetPlugin1&assetPlugin=assetPlugin2',
    ).then(function(response) {
      expect(DeltaBundler.prototype.buildGraph).toBeCalledWith({
        assetPlugins: ['assetPlugin1', 'assetPlugin2'],
        customTransformOptions: {},
        dev: true,
        entryPoints: ['/root/index.js'],
        hot: true,
        minify: false,
        onProgress: jasmine.any(Function),
        platform: null,
        type: 'module',
      });
    });
  });

  describe('Generate delta bundle endpoint', () => {
    it('should generate the initial delta correctly', async () => {
      const response = await makeRequest(
        requestHandler,
        'index.delta?platform=ios',
      );

      expect(JSON.parse(response.body)).toEqual({
        id: 'XXXXX-0',
        pre: [[-1, 'function () {require();}']],
        delta: [
          [0, '__d(function() {entry();},0,[1],"mybundle.js");'],
          [1, '__d(function() {foo();},1,[],"foo.js");'],
        ],
        post: [
          [
            2,
            '//# sourceMappingURL=http://localhost:8081/index.map?platform=ios',
          ],
        ],
        reset: true,
      });
    });

    it('should generate an incremental delta correctly', async () => {
      DeltaBundler.prototype.getDelta.mockReturnValue(
        Promise.resolve({
          modified: new Map([
            [
              '/root/foo.js',
              {
                path: '/root/foo.js',
                output: {code: '__d(function() {modified();});'},
                dependencies: new Map(),
              },
            ],
          ]),
          deleted: new Set(),
          reset: false,
        }),
      );

      // initial request.
      await makeRequest(requestHandler, 'index.delta?platform=ios');

      const response = await makeRequest(
        requestHandler,
        'index.delta?platform=ios&deltaBundleId=XXXXX-0',
      );

      expect(JSON.parse(response.body)).toEqual({
        id: 'XXXXX-1',
        pre: [],
        post: [],
        delta: [[1, '__d(function() {modified();},1,[],"foo.js");']],
        reset: false,
      });

      expect(DeltaBundler.prototype.getDelta.mock.calls[0][1]).toEqual({
        reset: false,
      });
    });

    it('should return a reset delta if the sequenceId does not match', async () => {
      DeltaBundler.prototype.getDelta.mockReturnValue(
        Promise.resolve({
          modified: new Map([
            [
              '/root/foo.js',
              {
                path: '/root/foo.js',
                output: {code: '__d(function() {modified();});'},
                dependencies: new Map(),
              },
            ],
          ]),
          deleted: new Set(),
          reset: false,
        }),
      );

      // Do an initial request.
      await makeRequest(requestHandler, 'index.delta?platform=ios');
      // First delta request has a matching id.
      await makeRequest(
        requestHandler,
        'index.delta?platform=ios&deltaBundleId=XXXXX-0',
      );
      // Second delta request does not have a matching id.
      await makeRequest(
        requestHandler,
        'index.delta?platform=ios&deltaBundleId=XXXXX-0',
      );

      expect(DeltaBundler.prototype.getDelta.mock.calls[0][1]).toEqual({
        reset: false,
      });
      expect(DeltaBundler.prototype.getDelta.mock.calls[1][1]).toEqual({
        reset: true,
      });
    });

    it('should include the error message for transform errors', () => {
      DeltaBundler.prototype.buildGraph.mockImplementation(async () => {
        const transformError = new SyntaxError('test syntax error');
        transformError.type = 'TransformError';
        transformError.filename = 'testFile.js';
        transformError.lineNumber = 123;
        throw transformError;
      });

      return makeRequest(requestHandler, 'index.delta?platform=ios').then(
        function(response) {
          expect(() => JSON.parse(response.body)).not.toThrow();
          const body = JSON.parse(response.body);
          expect(body).toMatchObject({
            type: 'TransformError',
            message: 'test syntax error',
          });
          expect(body.errors).toContainEqual({
            description: 'test syntax error',
            filename: 'testFile.js',
            lineNumber: 123,
          });
        },
      );
    });
  });

  describe('/onchange endpoint', () => {
    let EventEmitter;
    let req;
    let res;

    beforeEach(() => {
      EventEmitter = require.requireActual('events').EventEmitter;
      req = scaffoldReq(new EventEmitter());
      req.url = '/onchange';
      res = {
        writeHead: jest.fn(),
        end: jest.fn(),
      };
    });

    it('should hold on to request and inform on change', done => {
      jest.useRealTimers();
      server.processRequest(req, res);
      server.onFileChange('all', options.projectRoots[0] + 'path/file.js');
      res.end.mockImplementation(value => {
        expect(value).toBe(JSON.stringify({changed: true}));
        done();
      });
    });

    it('should not inform changes on disconnected clients', () => {
      server.processRequest(req, res);
      req.emit('close');
      jest.runAllTimers();
      server.onFileChange('all', options.projectRoots[0] + 'path/file.js');
      jest.runAllTimers();
      expect(res.end).not.toBeCalled();
    });
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
        expect(getAsset).toBeCalledWith('imgs/a.png', ['/root'], 'ios');
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
        expect(getAsset).toBeCalledWith('imgs/a.png', ['/root'], 'ios');
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
          ['/root'],
          undefined,
        );
        expect(value).toBe('i am image');
        done();
      });
    });
  });

  describe('build(options)', () => {
    it('Calls the delta bundler with the correct args', () => {
      return server
        .build({
          ...Server.DEFAULT_BUNDLE_OPTIONS,
          entryFile: 'foo file',
        })
        .then(() =>
          expect(DeltaBundler.prototype.buildGraph).toBeCalledWith({
            assetPlugins: [],
            customTransformOptions: {},
            dev: true,
            entryPoints: ['/root/foo file'],
            hot: false,
            minify: false,
            onProgress: null,
            platform: undefined,
            type: 'module',
          }),
        );
    });
  });

  describe('/symbolicate endpoint', () => {
    let symbolicationWorker;
    beforeEach(() => {
      symbolicationWorker = symbolicate.createWorker();
      symbolicationWorker.mockReset();
    });

    it('should symbolicate given stack trace', () => {
      const inputStack = [
        {
          file: 'http://foo.bundle?platform=ios',
          lineNumber: 2100,
          column: 44,
          customPropShouldBeLeftUnchanged: 'foo',
        },
      ];
      const outputStack = [
        {
          source: 'foo.js',
          line: 21,
          column: 4,
        },
      ];
      const body = JSON.stringify({stack: inputStack});

      expect.assertions(2);
      symbolicationWorker.mockImplementation(stack => {
        expect(stack).toEqual(inputStack);
        return outputStack;
      });

      return makeRequest(requestHandler, '/symbolicate', {
        rawBody: body,
      }).then(response =>
        expect(JSON.parse(response.body)).toEqual({stack: outputStack}),
      );
    });
  });

  describe('/symbolicate handles errors', () => {
    it('should symbolicate given stack trace', () => {
      const body = 'clearly-not-json';
      console.error = jest.fn();

      return makeRequest(requestHandler, '/symbolicate', {
        rawBody: body,
      }).then(response => {
        expect(response.statusCode).toEqual(500);
        expect(JSON.parse(response.body)).toEqual({
          error: jasmine.any(String),
        });
        expect(console.error).toBeCalled();
      });
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
