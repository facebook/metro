---
id: concepts
title: Concepts
---
Metro是一个JavaScript打包器，给它一些options和入口文件，将返回一个包含项目中所有JavaScript文件的js文件

Metro在打包过程中有如下三个阶段：

1. 分解
2. 转换
3. 序列化

### 分解

Metro通过`resovler`把文件之间的互相引用转化成一个个单独的模块，最后得到一个包含所有模块的graph。实际上这个阶段和转化阶段是在同时进行

### 转换

所有的模块都将通过装换器转化成目标平台(比如：React Native)可以识别的模块，另外模块的转换将基于您`maxWorkers`指定的数量并行进行

### Serialization

一旦所有的模块被转换完成，它们将把跟入口文件相关的模块组合起来生成一个或者多个js文件，该文件就是我们最终想要的包

## Modules

Metro已经被拆分成三个模块，分别对应上面的分解阶段、转换阶段、序列化阶段。这三个模块可以根据你的需要进行swapped out(译者注：没搞明白，最后想说什么)
