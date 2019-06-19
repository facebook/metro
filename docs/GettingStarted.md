---
id: getting-started
title: Getting Started
---

使用[`npm`](https://www.npmjs.com/)安装Metro:

```
npm install --save-dev metro metro-core
```

或者使用 [`yarn`](https://yarnpkg.com/):

```
yarn add --dev metro metro-core
```

## 运行 `metro`

可以使用[命令行](./CLI.md)运行Metro，也可以通过手动编码方式

### 手动编码方式运行

首先引入Metro模块:

```js
const Metro = require('metro');
```

返回的Metro对象中，有如下几个重要的方法

### 方法 `runMetro(config)`

传入参数config，将会返回一个metro-server(译者注：被Promise包裹的metro-server)，你可以将它的processRequest方法作为hook连接到合适的HTTP(S)服务器上。

```js
'use strict';

const http = require('http');
const Metro = require('metro');

// We first load the config from the file system
Metro.loadConfig().then(config => Metro.runMetro(config)).then((metroBundlerServer) => {
  const httpServer = http.createServer(
    metroBundlerServer.processRequest.bind(metroBundlerServer),
  );
  httpServer.listen(8888);
});
```
为了兼容Express App，当请求不能够被Metro bundler处理时processRequest将调用第三个参数，这允许你将metro-server和已经存在的服务器做合并或者扩展一个新的。

```js
const httpServer = http.createServer((req, res) => {
  metroBundlerServer.processRequest(req, res, () => {
    // Metro does not know how to handle the request.
  });
});
```
如果你使用[Express](http://expressjs.com/)，那刚好可以将processRequest作为Express的中间件

```js
const express = require('express');
const app = express();

app.use(
  metroBundlerServer.processRequest.bind(metroBundlerServer),
);

app.listen(8081);
```

### 方法 `runServer(Config, Options)`

基于给定的config和options开启一个服务并返回，我们推荐使用`runMetro`代替`runServer`, `runMetro`内部其实已经调用`runServer`方法

#### Options

* `host (string)`: 在哪里托管服务器
* `onReady (Function)`: 当服务器准备好处理请求时调用
* `secure (boolean)`:   该服务器基于`https`还是`http`
* `secureKey (string)`: `https`协议下使用的secureKey
* `secureCert (string)`: `https`协议下使用的证书
* `hmrEnabled (boolean)`: 是否打开Hot Module Replacement

### 方法 `runBuild(Config, Options)`

基于指定的config和options构建Bundle文件并且返回一个被Promise包裹的对象，该对象有code和map两个属性。

#### Options

* `dev (boolean)`: 生成构建的开发版本 (`process.env.NODE_ENV = 'development'`)
* `entry (string)`: bundle的入口文件
* `onBegin (Function)`: 开始构建是调用
* `onComplete (Function)`: 构建结束时调用
* `onProgress (Function)`: 构建过程中调用，有两个参数来表示构建进度
* `minify (boolean)`: 是否应该压缩bundle
* `out (string)`: bundle的输出路径
* `platform ('web' | 'android' | 'ios')`: 在哪个平台下打包
* `sourceMap (boolean)`: 是否生成对应source map文件
* `sourceMapUrl (string)`: 存错sourceMap的url,它默认为与包相同的URL，但将扩展名从`.bundle`更改为`.map`。当‘inlineSourceMap’是‘true’时，此属性无效(译者注：表示没看懂)。

## 可用选项

### Configuration

有关配置选项的详细信息，请移步[Configuring Metro](./Configuration.md)

## URL和bundle请求

打包服务可以生成assets、bundles、source map三种类型的资源

### Assets

In order to request an asset, you can freely use the `require` method as if it was another JS file. The server will treat this specific `require` calls  and make them return the path to that file. When an asset is requested (an asset is recognized by its extension, which has to be on the `assetExts` array) it is generally served as-is.

However, the server is also able to serve specific assets depending on the platform and on the requested size (in the case of images). The way you specify the platform is via the dotted suffix (e.g. `.ios`) and the resolution via the at suffix (e.g. `@2x`). This is transparently handled for you when using `require`.

### Bundle

Any JS file can be used as the root for a bundle request. The file will be looked in the `projectRoot`. All files that are required by the root will be recursively included. In order to request a bundle, just change the extension from `.js` to `.bundle`. Options for building the bundle are passed as query parameters (all optional).

* `dev`: build the bundle in development mode or not. Maps 1:1 to the `dev` setting of the bundles. Pass `true` or `false` as strings into the URL.
* `platform`: platform requesting the bundle. Can be `ios` or `android`. Maps 1:1 to the `platform` setting of the bundles.
* `minify`: whether code should be minified or not. Maps 1:1 to the `minify` setting of the bundles. Pass `true` or `false` as strings into the URL.
* `excludeSource`: whether sources should be included in the source map or not. Pass `true` or `false` as strings into the URL.

For instance, requesting `http://localhost:8081/foo/bar/baz.bundle?dev=true&platform=ios` will create a bundle out of `foo/bar/baz.js` for iOS in development mode.

### Source maps

Source maps are built for each bundle by using the same URL as the bundle (thus, the same as the JS file acting as a root). This will only work when `inlineSourceMap` is set to `false`. All options you passed to the bundle will be added to the source map URL; otherwise, they wouldn't match.

## JavaScript transformer

The JavaScript transformer (`babelTransformerPath`) is the place where JS code will be manipulated; useful for calling Babel. The transformer can export two methods:

### Method `transform(module)`

Mandatory method that will transform code. The object received has information about the module being transformed (e.g its path, code...) and the returned object has to contain an `ast` key that is the AST representation of the transformed code. The default shipped transformer does the bare minimum amount of work by just parsing the code to AST:

```js
const babylon = require('@babel/parser');

module.exports.transform = (file: {filename: string, src: string}) => {
  const ast = babylon.parse(code, {sourceType: 'module'});

  return {ast};
};
```

If you would like to plug-in babel, you can simply do that by passing the code to it:

```js
const {transformSync} = require('@babel/core');

module.exports.transform = file => {
  return transformSync(file.src, {
    // Babel options...
  });
};
```

### Method `getCacheKey()`

Optional method that returns the cache key of the transformer. When using different transformers, this allows to correctly tie a transformed file to the transformer that converted it. The result of the method has to be a `string`.
