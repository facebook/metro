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
  .mock('../../Assets')
  .mock('../../node-haste/DependencyGraph')
  .mock('metro-core/src/Logger')
  .mock('../../lib/GlobalTransformCache')
  .mock('../../DeltaBundler/Serializers/Serializers');

describe('processRequest', () => {
  let Bundler;
  let Server;
  let getAsset;
  let symbolicate;
  let Serializers;
  let DeltaBundler;
  const lastModified = new Date();

  beforeEach(() => {
    jest.useFakeTimers();
    jest.resetModules();
    Bundler = require('../../Bundler');
    Server = require('../');
    getAsset = require('../../Assets').getAsset;
    symbolicate = require('../symbolicate/symbolicate');
    Serializers = require('../../DeltaBundler/Serializers/Serializers');
    DeltaBundler = require('../../DeltaBundler');
  });

  let server;

  const options = {
    projectRoots: ['root'],
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

  const invalidatorFunc = jest.fn();
  let requestHandler;

  beforeEach(() => {
    Serializers.fullBundle.mockReturnValue(
      Promise.resolve({
        bundle: 'this is the source',
        numModifiedFiles: 38,
        lastModified,
      }),
    );

    Serializers.fullSourceMap.mockReturnValue(
      Promise.resolve('this is the source map'),
    );

    Bundler.prototype.bundle = jest.fn(() =>
      Promise.resolve({
        getModules: () => [],
        getSource: () => 'this is the source',
        getSourceMap: () => ({version: 3}),
        getSourceMapString: () => 'this is the source map',
        getEtag: () => 'this is an etag',
      }),
    );

    Bundler.prototype.invalidateFile = invalidatorFunc;
    Bundler.prototype.getDependencyGraph = jest.fn().mockReturnValue(
      Promise.resolve({
        getHasteMap: jest.fn().mockReturnValue({on: jest.fn()}),
        load: jest.fn(() => Promise.resolve()),
      }),
    );

    server = new Server(options);
    requestHandler = server.processRequest.bind(server);
  });

  it('returns JS bundle source on request of *.bundle', () => {
    return makeRequest(
      requestHandler,
      'mybundle.bundle?runModule=true',
      null,
    ).then(response => expect(response.body).toEqual('this is the source'));
  });

  it('returns JS bundle source on request of *.bundle (compat)', () => {
    return makeRequest(requestHandler, 'mybundle.runModule.bundle').then(
      response => expect(response.body).toEqual('this is the source'),
    );
  });

  it('returns Last-Modified header on request of *.bundle', () => {
    return makeRequest(requestHandler, 'mybundle.bundle?runModule=true').then(
      response => {
        expect(response.getHeader('Last-Modified')).toBeDefined();
      },
    );
  });

  it('returns build info headers on request of *.bundle', () => {
    return makeRequest(requestHandler, 'mybundle.bundle?runModule=true').then(
      response => {
        expect(response.getHeader('X-Metro-Files-Changed-Count')).toEqual('38');
      },
    );
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

  it('returns 304 on request of *.bundle when if-modified-since equals Last-Modified', () => {
    return makeRequest(requestHandler, 'mybundle.bundle?runModule=true', {
      headers: {'if-modified-since': lastModified.toUTCString()},
    }).then(response => {
      expect(response.statusCode).toEqual(304);
    });
  });

  it('returns sourcemap on request of *.map', () => {
    return makeRequest(requestHandler, 'mybundle.map?runModule=true').then(
      response => expect(response.body).toEqual('this is the source map'),
    );
  });

  it('works with .ios.js extension', () => {
    return makeRequest(requestHandler, 'index.ios.includeRequire.bundle').then(
      response => {
        expect(response.body).toEqual('this is the source');
        expect(Serializers.fullBundle).toBeCalledWith(
          expect.any(DeltaBundler),
          {
            assetPlugins: [],
            bundleType: 'bundle',
            customTransformOptions: {},
            dev: true,
            entryFile: 'index.ios.js',
            entryModuleOnly: false,
            excludeSource: false,
            hot: true,
            inlineSourceMap: false,
            isolateModuleIDs: false,
            minify: false,
            onProgress: jasmine.any(Function),
            platform: null,
            resolutionResponse: null,
            runBeforeMainModule: ['InitializeCore'],
            runModule: true,
            sourceMapUrl: 'http://localhost:8081/index.ios.includeRequire.map',
            unbundle: false,
          },
        );
      },
    );
  });

  it('passes in the platform param', function() {
    return makeRequest(requestHandler, 'index.bundle?platform=ios').then(
      function(response) {
        expect(response.body).toEqual('this is the source');
        expect(Serializers.fullBundle).toBeCalledWith(
          expect.any(DeltaBundler),
          {
            assetPlugins: [],
            bundleType: 'bundle',
            customTransformOptions: {},
            dev: true,
            entryFile: 'index.js',
            entryModuleOnly: false,
            excludeSource: false,
            hot: true,
            inlineSourceMap: false,
            isolateModuleIDs: false,
            minify: false,
            onProgress: jasmine.any(Function),
            platform: 'ios',
            resolutionResponse: null,
            runBeforeMainModule: ['InitializeCore'],
            runModule: true,
            sourceMapUrl: 'http://localhost:8081/index.map?platform=ios',
            unbundle: false,
          },
        );
      },
    );
  });

  it('passes in the assetPlugin param', function() {
    return makeRequest(
      requestHandler,
      'index.bundle?assetPlugin=assetPlugin1&assetPlugin=assetPlugin2',
    ).then(function(response) {
      expect(response.body).toEqual('this is the source');
      expect(Serializers.fullBundle).toBeCalledWith(expect.any(DeltaBundler), {
        assetPlugins: ['assetPlugin1', 'assetPlugin2'],
        bundleType: 'bundle',
        customTransformOptions: {},
        dev: true,
        entryFile: 'index.js',
        entryModuleOnly: false,
        excludeSource: false,
        hot: true,
        inlineSourceMap: false,
        isolateModuleIDs: false,
        minify: false,
        onProgress: jasmine.any(Function),
        platform: null,
        resolutionResponse: null,
        runBeforeMainModule: ['InitializeCore'],
        runModule: true,
        sourceMapUrl:
          'http://localhost:8081/index.map?assetPlugin=assetPlugin1&assetPlugin=assetPlugin2',
        unbundle: false,
      });
    });
  });

  describe('Generate delta bundle endpoint', () => {
    it('should generate a new delta correctly', () => {
      Serializers.deltaBundle.mockImplementation(async (_, options) => {
        expect(options.deltaBundleId).toBe(undefined);

        return {
          bundle: '{"delta": "bundle"}',
          numModifiedFiles: 3,
        };
      });

      return makeRequest(requestHandler, 'index.delta?platform=ios').then(
        function(response) {
          expect(response.body).toEqual('{"delta": "bundle"}');
        },
      );
    });

    it('should send the correct deltaBundlerId to the bundler', () => {
      Serializers.deltaBundle.mockImplementation(
        async (_, clientId, options) => {
          expect(clientId).toMatchSnapshot();
          expect(options.deltaBundleId).toBe('1234');

          return {
            bundle: '{"delta": "bundle"}',
            numModifiedFiles: 3,
          };
        },
      );

      return makeRequest(
        requestHandler,
        'index.delta?platform=ios&deltaBundleId=1234',
      ).then(function(response) {
        expect(response.body).toEqual('{"delta": "bundle"}');
      });
    });

    it('should include the error message for transform errors', () => {
      Serializers.deltaBundle.mockImplementation(async () => {
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
        expect(getAsset).toBeCalledWith('imgs/a.png', ['root'], 'ios');
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
        expect(getAsset).toBeCalledWith('imgs/a.png', ['root'], 'ios');
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
          ['root'],
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
          expect(Serializers.fullBundle).toBeCalledWith(
            expect.any(DeltaBundler),
            {
              assetPlugins: [],
              customTransformOptions: {},
              dev: true,
              entryFile: 'foo file',
              entryModuleOnly: false,
              excludeSource: false,
              hot: false,
              inlineSourceMap: false,
              isolateModuleIDs: false,
              minify: false,
              onProgress: null,
              platform: undefined,
              resolutionResponse: null,
              runBeforeMainModule: ['InitializeCore'],
              runModule: true,
              sourceMapUrl: null,
              unbundle: false,
            },
          ),
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
