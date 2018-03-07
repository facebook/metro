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
  .mock('fs')
  .mock('graceful-fs')
  .mock('../ModuleCache')
  .mock('../DependencyGraph/DependencyGraphHelpers')
  .mock('../../lib/TransformCaching');

const Module = require('../Module');
const ModuleCache = require('../ModuleCache');
const DependencyGraphHelpers = require('../DependencyGraph/DependencyGraphHelpers');
const TransformCaching = require('../../lib/TransformCaching');
const fs = require('fs');

const packageJson = JSON.stringify({
  name: 'arbitrary',
  version: '1.0.0',
  description: "A require('foo') story",
});

function mockFS(rootChildren) {
  fs.__setMockFilesystem({root: rootChildren});
}

function mockPackageFile() {
  mockFS({'package.json': packageJson});
}

function mockIndexFile(indexJs) {
  mockFS({'index.js': indexJs});
}

describe('Module', () => {
  const fileName = '/root/index.js';

  let cache;
  const transformCache = TransformCaching.mocked();

  const createCache = () => ({
    get: jest
      .genMockFn()
      .mockImplementation((filepath, field, cb) => cb(filepath)),
    invalidate: jest.genMockFn(),
    end: jest.genMockFn(),
  });

  let transformCacheKey;
  const createModule = options =>
    new Module({
      options: {transformCache},
      transformCode: (module, sourceCode, transformOptions) => {
        return Promise.resolve({code: sourceCode});
      },
      ...options,
      cache,
      file: (options && options.file) || fileName,
      depGraphHelpers: new DependencyGraphHelpers(),
      localPath: (options && options.localPath) || fileName,
      moduleCache: new ModuleCache({cache}),
      getTransformCacheKey: () => transformCacheKey,
    });

  const createJSONModule = options =>
    createModule({...options, file: '/root/package.json'});

  beforeEach(function() {
    Object.defineProperty(process, 'platform', {
      configurable: true,
      enumerable: true,
      value: 'linux',
    });
    cache = createCache();
    transformCacheKey = 'abcdef';
    transformCache.mock.reset();
  });

  describe('Experimental caches', () => {
    it('Calls into the transformer directly when having experimental caches on', async () => {
      const transformCode = jest.fn().mockReturnValue({
        code: 'code',
        dependencies: ['dep1', 'dep2'],
        map: [],
      });

      const module = new Module({
        cache,
        experimentalCaches: true,
        depGraphHelpers: new DependencyGraphHelpers(),
        file: fileName,
        getTransformCacheKey: () => transformCacheKey,
        localPath: fileName,
        moduleCache: new ModuleCache({cache}),
        options: {transformCache},
        transformCode,
      });

      mockIndexFile('originalCode');
      jest.spyOn(fs, 'readFileSync');

      // Read the first time, transform code is called.
      const res1 = await module.read({foo: 3});
      expect(res1.code).toBe('code');
      expect(res1.dependencies).toEqual(['dep1', 'dep2']);
      expect(transformCode).toHaveBeenCalledTimes(1);

      // Read a second time, transformCode is called again!
      const res2 = await module.read({foo: 3});
      expect(res2.code).toBe('code');
      expect(res2.dependencies).toEqual(['dep1', 'dep2']);
      expect(transformCode).toHaveBeenCalledTimes(2);

      // Code was only read once, though.
      expect(fs.readFileSync).toHaveBeenCalledTimes(1);
    });
  });

  describe('Module ID', () => {
    const moduleId = 'arbitraryModule';
    const source = `/**
       * @providesModule ${moduleId}
       */
    `;

    let module;
    beforeEach(() => {
      module = createModule();
    });

    describe('@providesModule annotations', () => {
      beforeEach(() => {
        mockIndexFile(source);
      });

      it('extracts the module name from the header', () => {
        expect(module.getName()).toEqual(moduleId);
      });

      it('identifies the module as haste module', () => {
        expect(module.isHaste()).toBe(true);
      });

      it('does not transform the file in order to access the name', () => {
        const transformCode = jest
          .genMockFn()
          .mockReturnValue(Promise.resolve());

        createModule({transformCode}).getName();
        expect(transformCode).not.toBeCalled();
      });

      it('does not transform the file in order to access the haste status', () => {
        const transformCode = jest
          .genMockFn()
          .mockReturnValue(Promise.resolve());
        createModule({transformCode}).isHaste();
        expect(transformCode).not.toBeCalled();
      });
    });

    describe('no annotation', () => {
      beforeEach(() => {
        mockIndexFile('arbitrary(code);');
      });

      it('uses the file name as module name', () => {
        expect(module.getName()).toEqual(fileName);
      });

      it('does not identify the module as haste module', () =>
        expect(module.isHaste()).toBe(false));

      it('does not transform the file in order to access the name', () => {
        const transformCode = jest
          .genMockFn()
          .mockReturnValue(Promise.resolve());

        createModule({transformCode}).getName();
        expect(transformCode).not.toBeCalled();
      });

      it('does not transform the file in order to access the haste status', () => {
        const transformCode = jest
          .genMockFn()
          .mockReturnValue(Promise.resolve());
        createModule({transformCode}).isHaste();
        expect(transformCode).not.toBeCalled();
      });
    });
  });

  describe('Code', () => {
    const fileContents = 'arbitrary(code)';
    beforeEach(function() {
      mockIndexFile(fileContents);
    });

    it('exposes file contents as `code` property on the data exposed by `read()`', () =>
      createModule()
        .read()
        .then(({code}) => expect(code).toBe(fileContents)));
  });

  describe('Custom Code Transform', () => {
    let transformCode;
    let transformResult;
    const fileContents = 'arbitrary(code);';
    const exampleCode = `
      ${'require'}('a');
      ${'System.import'}('b');
      ${'require'}('c');`;

    beforeEach(function() {
      transformResult = {code: ''};
      transformCode = jest
        .genMockFn()
        .mockImplementation((module, sourceCode, options) => {
          transformCache.writeSync({
            filePath: module.path,
            sourceCode,
            transformOptions: options,
            getTransformCacheKey: () => transformCacheKey,
            result: transformResult,
          });
          return Promise.resolve(transformResult);
        });
      mockIndexFile(fileContents);
    });

    it('passes the module and file contents to the transform function when reading', () => {
      const module = createModule({transformCode});
      return module.read().then(() => {
        expect(transformCode).toBeCalledWith(module, fileContents, undefined);
      });
    });

    it('passes any additional options to the transform function when reading', () => {
      const module = createModule({transformCode});
      const transformOptions = {arbitrary: Object()};
      return module
        .read(transformOptions)
        .then(() =>
          expect(transformCode.mock.calls[0][2]).toBe(transformOptions),
        );
    });

    it('passes the module and file contents to the transform for JSON files', () => {
      mockPackageFile();
      const module = createJSONModule({transformCode});
      return module.read().then(() => {
        expect(transformCode).toBeCalledWith(module, packageJson, undefined);
      });
    });

    it('does not extend the passed options object for JSON files', () => {
      mockPackageFile();
      const module = createJSONModule({transformCode});
      const options = {arbitrary: 'foo'};
      return module.read(options).then(() => {
        expect(transformCode).toBeCalledWith(module, packageJson, options);
      });
    });

    it('uses dependencies that `transformCode` resolves to, instead of extracting them', async () => {
      const mockedDependencies = ['foo', 'bar'];
      transformResult = {
        code: exampleCode,
        dependencies: mockedDependencies,
      };
      const module = createModule({transformCode});
      const data = await module.read();

      expect(data.dependencies).toEqual(mockedDependencies);
    });

    it('forwards all additional properties of the result provided by `transformCode`', () => {
      transformResult = {
        code: exampleCode,
        arbitrary: 'arbitrary',
        dependencyOffsets: [12, 764],
        map: {version: 3},
        subObject: {foo: 'bar'},
      };
      const module = createModule({transformCode});

      return module.read().then(result => {
        expect(result).toEqual(jasmine.objectContaining(transformResult));
      });
    });

    it('exposes the transformed code rather than the raw file contents', async () => {
      transformResult = {code: exampleCode};
      const module = createModule({transformCode});
      const data = await module.read();

      expect(data.code).toBe(exampleCode);
    });

    it('exposes the raw file contents as `source` property', () => {
      const module = createModule({transformCode});
      return module.read().then(data => expect(data.source).toBe(fileContents));
    });

    it('exposes a source map returned by the transform', async () => {
      const map = {version: 3};
      transformResult = {map, code: exampleCode};
      const module = createModule({transformCode});
      const data = await module.read();

      expect(data.map).toBe(map);
    });

    it('caches the transform result for the same transform options', () => {
      let module = createModule({transformCode});
      return module.read().then(() => {
        expect(transformCode).toHaveBeenCalledTimes(1);
        // We want to check transform caching rather than shallow caching of
        // Promises returned by read().
        module = createModule({transformCode});
        return module.read().then(() => {
          expect(transformCode).toHaveBeenCalledTimes(1);
        });
      });
    });

    it('triggers a new transform for different transform options', () => {
      const module = createModule({transformCode});
      return module.read({foo: 1}).then(() => {
        expect(transformCode).toHaveBeenCalledTimes(1);
        return module.read({foo: 2}).then(() => {
          expect(transformCode).toHaveBeenCalledTimes(2);
        });
      });
    });

    it('triggers a new transform for different source code', () => {
      let module = createModule({transformCode});
      return module.read().then(() => {
        expect(transformCode).toHaveBeenCalledTimes(1);
        cache = createCache();
        mockIndexFile('test');
        module = createModule({transformCode});
        return module.read().then(() => {
          expect(transformCode).toHaveBeenCalledTimes(2);
        });
      });
    });

    it('triggers a new transform for different transform cache key', () => {
      let module = createModule({transformCode});
      return module.read().then(() => {
        expect(transformCode).toHaveBeenCalledTimes(1);
        transformCacheKey = 'other';
        module = createModule({transformCode});
        return module.read().then(() => {
          expect(transformCode).toHaveBeenCalledTimes(2);
        });
      });
    });
  });
});
