---
id: configuration
title: Configuring Metro
---

有如下三种方式配置Metro(按照优先级排序):

1.  `metro.config.js`
2.  `metro.config.json`
3.  `package.json`中的`metro`字段

你也可以自定义一个配置文件，在执行bundle脚本时使用`--config <path/to/config>`来指定配置文件路径

## 配置结构

配置基于[concepts](./Concepts.md)，每个步骤都有一个单独的配置项，Metro中常见的配置结构如下：

```js
module.exports = {
  resolver: {
    /* 解析配置 */
  },
  transformer: {
    /* 转换配置 */
  },
  serializer: {
    /* 序列化配置 */
  },
  server: {
    /* 服务器配置 */
  }

  /* 通用配置 */
};
```

### 通用配置

#### `cacheStores`

Type: `Array<CacheStore<TransformResult<>>`

列出我们存放[缓存](./Caching.md)的地方

#### `cacheVersion`

Type: `string`

可用于生成一个将整个Metro缓存失效的key

#### `projectRoot`

Type: `string`

项目根目录

#### `watchFolders`

Type: `Array<string>`

指定要监视的根目录文件夹

#### `transformerPath`

Type: `string`

要使用转换器模块所在的路径

#### `watch`

Type: `boolean`

是否监视所有的文件

#### `reporter`

Type: `{update: () => void}`

打包过程中用于记录打包状态

#### `resetCache`

Type: `boolean`

就是构建时是否重置缓存

#### `stickyWorkers`

Type: `boolean`

是否基于文件名创建workers

#### `maxWorkers`

Type: `number`

转换时可以并行的最大值

### 服务器配置

Metro服务器所使用的配置

#### `port`

Type: `number`

指定监听的端口号

#### `useGlobalHotkey`

Type: `boolean`

是否启用`CMD+R`热键来刷新bundle

#### `enhanceMiddleware`

Type: `(Middleware, Server) => Middleware`

将自定义中间件添加到Metro服务器的响应链

#### `enableVisualizer`

Type: `boolean`

启用`metro-visualizer`中间件（可从`/visualizer`获得）。这需要在您的项目中安装`metro-visualizer`(译者注：这个库有问题)

#### `runInspectorProxy`

Type: `boolean` (default: `true`)

在Metro中运行Inspector代理服务器，以便能够检查React Native代码。


### Transformer Options

#### `asyncRequireModulePath`

Type: `string`

指定处理异步的模块

#### `babelTransformerPath`

Type: `string`

指定一个自定义的转换器(only relevant when using the default transformerPath)

#### `dynamicDepsInPackages`

Type: `string` (`throwAtRuntime` or `reject`)

当发现一个动态的依赖库时应该怎么处理

#### `enableBabelRCLookup`

Type: `boolean` (default: `true`)

是否使用`.babelrc`配置文件

#### `enableBabelRuntime`

Type: `boolean` (default: `true`)

转换器是否使用`@babel/transform/runtime`插件

#### `getTransformOptions`

Type: `GetTransformOptions`

获取转换器默认选项

#### `postMinifyProcess`

Type: `PostMinifyProcess`

压缩之后要做什么事情

#### `minifierPath`

Type: `string`

指定转换后混淆器的路径

#### `minifierConfig`

Type: `{[key: string]: mixed}`

代码混淆配置

#### `optimizationSizeLimit`

Type: `number`

为大文件定义一个阈值(以字节为单位)以禁用一些昂贵的优化

#### 仅支持React Native

#### `assetPlugins`

Type: `Array<string>`

可以修改Asset资源的模块列表

#### `assetRegistryPath`

Type: `string`

在哪里获取资源文件

### 解析器选项

#### `assetExts`

Type: `Array<string>`

可以包含在bundle中的Asset扩展名列表。例如，如果你想在bundle中包含`['ttf']`类型的asset，该列表就包含这个扩展名

#### `sourceExts`

Type: `Array<string>`

可以包含在bundle中的source扩展名列表。例如，如果你想在bundle中包含`['ts']`类型的source，该列表就包含这个扩展名

#### `resolverMainFields`

Type: `Array<string>`

Specify the fields in package.json files that will be used by the module resolver to do redirections when requiring certain packages. For example, using `['browser', 'main']` will use the `browser` field if it exists and will default to `main` if it doesn't.(译者注：不理解，提供两个链接[package.json文件说明](https://javascript.ruanyifeng.com/nodejs/packagejson.html))和[RN的require过程](https://zhuanlan.zhihu.com/p/41689115)

#### `extraNodeModules`

Type: `{[name:string]:string}`

当前项目提供额外引入的模块，配置格式为[{ 模块名 : 路径 }]

#### `resolveRequest`

Type: `?CustomResolver`

该配置可以为null，可以通过该函数来决定是否忽略此次解析，

#### `useWatchman`

Type: `boolean`

如果设置为`false`, 将禁止Metro使用watchman，即使它被安装。 该配置仅仅对RN项目有用

#### `blacklistRE`

Type: `RegExp`

通过正则指定打包的黑名单

#### `hasteImplModulePath`

Type: `string`

指定haste resolver(译者注：我也不知道是什么鬼)

#### `platforms`

Type: `Array<string>`

需要注意的其他平台，例如，如果你想在这里添加"custom"平台并且模块使用`.custom.js`结尾，应该在这里加上`custom`

### 序列化选项

#### `getRunModuleStatement`

Type: `(number` &#x7c; `string) => string`

指定附加在包末尾的出事require语句的格式，默认情况下是`__r(${moduleId});`

#### `createModuleIdFactory`

Type: `() => (path: string) => number`

用于为`require`语句生成模块id

#### `getPolyfills`

Type: `({platform: ?string}) => $ReadOnlyArray<string>`

要包含在包中的可选Polyfill列表，默认有一些常用的Polyfill，比如Number,String,Array,Object....

#### `postProcessBundleSourcemap`

Type: `PostProcessBundleSourcemap`

该函数可以在bundle和sourcemap写入文件之前，修改内容，适用于整个bundle包

#### `getModulesRunBeforeMainModule`

Type: `(entryFilePath: string) => Array<string>`

在引用主模块前要引用的一些模块(要指定每个模块的绝对路径)，另外，当这些模块已经作为bundle的一部分时，才会加载其他的reqire语句

#### `processModuleFilter`

Type: `(module: Array<Module>) => boolean`

过滤掉特定模块

## metro-config的合并

使用`metro-config`，可以将多个配置文件合并在一起。(译者注：并不是用于做bundle包的拆分，**猜测**用于将默认配置和自定义的配置合在一块，这样可以避免自定义配置里重复写一些默认的配置)

| Method                                  | Description                                                            |
| --------------------------------------- | ---------------------------------------------------------------------- |
| `mergeConfig(...configs): MergedConfig` | 返回两个或多个配置对象的合并配置 |

> **注意:** 基于数组和基于函数的配置参数不会深度合并，而是覆盖任何预先存在的配置参数
> 允许覆盖和删除在您的环境中可能不需要的默认配置参数，例如`platforms`或`getModulesRunBeforeMainModule`

#### 举个栗子

```js
// metro.config.js
const { mergeConfig } = require("metro-config");

const configA = {
  resolver: {
    /* resolver options */
  },
  transformer: {
    /* transformer options */
  },
  serializer: {
    /* serializer options */
  },
  server: {
    /* server options */
  }
  /* general options */
};

const configB = {
  resolver: {
    /* resolver options */
  },
  transformer: {
    /* transformer options */
  },
  serializer: {
    /* serializer options */
  },
  server: {
    /* server options */
  }
  /* general options */
};

module.exports = mergeConfig(configA, configB);
```
