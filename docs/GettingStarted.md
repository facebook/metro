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

可以使用[脚手架](./CLI.md)运行Metro，也可以通过手动编码

### 手动编码运行

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

基于给定的config和options开启一个服务并返回该服务，我们推荐使用`runMetro`代替`runServer`, `runMetro`内部其实已经调用`runServer`方法

#### Options

* `host (string)`: 在哪里托管服务器
* `onReady (Function)`: 当服务器准备好处理请求时调用
* `secure (boolean)`:   该服务器基于`https`还是`http`
* `secureKey (string)`: `https`协议下使用的secureKey
* `secureCert (string)`: `https`协议下使用的证书
* `hmrEnabled (boolean)`: 是否打开Hot Module Replacement

### 方法 `runBuild(Config, Options)`

基于指定的config、options和一组特定于bundle本身的option构建Bundle文件，返回值是一个被Promise包裹的对象，该对象有`code`和`map`两个属性

#### Options

* `dev (boolean)`: 指定构建开发版本还是生产版本，在产物.bundle的`process.env.NODE_ENV = 'development'`处体现
* `entry (string)`: 指定此次打包的入口文件
* `onBegin (Function)`: 开始构建时调用
* `onComplete (Function)`: 构建结束时调用
* `onProgress (Function)`: 构建过程中调用，有两个参数来表示构建进度
* `minify (boolean)`: 是否压缩bundle
* `out (string)`: bundle的输出路径
* `platform ('web' | 'android' | 'ios')`: 指定平台
* `sourceMap (boolean)`: 在跟out同级目录生成source map文件，并在bundle文件的最后一行指定map文件的路径或者完整map文件的base64内容，例如：`//# sourceMappingURL=./bundle.map`
* `sourceMapUrl (string)`: 在bundle文件的最后一行指定source map文件的路径

## 可用选项

### Configuration

有关config选项的详细信息，请移步[Configuring Metro](./Configuration.md)

## URL和bundle请求

打包服务可以生成assets(译者注：资源文件)、bundles、source map三种类型的资源

### Assets

你可以像引用js文件一样使用`require`方法去引用Asset文件，服务器会处理这种特殊引用并让它们返回到指定路径，当一个资源被请求时(资源通过扩展名识别，它必须在`assetExts`数组上)，它通常被当做类js文件

但是，服务器还能够根据平台和请求的大小(指图片)提供特定的资产。您指定平台的方式是通过点后缀(例如.ios)和通过@后缀(例如@2x)的解析，你使用`require`时，会显式的处理。

### Bundle

bundle请求时，任何JS文件都可以作为bundle的根，该文件将在`Projectroot`中查找，根目录所有文件都将递归地包含在内，为了请求包，只需将扩展名从`.js`更改为`.bundle`，构建包的选项作为查询参数传递(都是可选的)。


* `dev`: 在开发模式下构建包。映射1：1到包的“发展”设置。将‘true’或‘false’作为字符串传递到URL中
* `platform`: 请求捆绑的平台。可以是iOS或Android。地图1:1的平台设置的捆绑
* `minify`: 是否应该缩小代码。映射1：1到捆绑包的“minify”设置。将‘true’或‘false’作为字符串传递到URL中。
* `excludeSource`: 来源是否应该包含在源地图中。将“true”或“false”作为字符串输入到url中

比如, 请求 `http://localhost:8081/foo/bar/baz.bundle?dev=true&platform=ios` 将为iOS在开发模式创建一个bundle并输出到 `foo/bar/baz.js`

### Source maps

在打包的时候为每个bundle创建一个source map文件

## JavaScript transformer

js转换器是操作js代码的地方，在调用Babel时使用，它导出有两个方法：


### Method `transform(module)`

强制将指定模块(module对象包含路径、代码等信息)转化为AST，默认的转换器仅能将代码转化为AST,以此来完成最低限度的工作

```js
const babylon = require('@babel/parser');

module.exports.transform = (file: {filename: string, src: string}) => {
  const ast = babylon.parse(code, {sourceType: 'module'});

  return {ast};
};
```
如果你想使用Babel插件，你可以将代码传递给他来完成

```js
const {transformSync} = require('@babel/core');

module.exports.transform = file => {
  return transformSync(file.src, {
    // Babel options...
  });
};
```

### Method `getCacheKey()`

返回转换器cache key的可选方法。当使用不同的转换器时，这允许将转换后的文件正确地绑定到转换它的转换器。该方法的结果必须是`string`。
