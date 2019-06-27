---
id: cli
title: Metro CLI Options
---

`Metro`脚手架有很多有用的选项，可以通过`metro --help`查看所有可用选项，下面是简要概述

## `build <entry>`

生成一个js bundle包，包括指定的入口文件及其该文件依赖的所有内容

### Options

| Option   | Description    |
|----------|----------|
| `out`    | 文件输出位置      |


## `serve`

通过指定的端口，开启一个用于云端打包的Metro server

## `get-dependencies`

获取依赖列表

### Options

| Option | Description |
|---|---|
| `entry-file` | 入口文件的绝对路径 |
| `output` | 输出文件的名字, ex. /tmp/dependencies.txt |
| `platform` | 选择打包平台 |
| `transformer` | 指定要使用的自定义转换器 |
| `max-workers` | 转化时可以并行的最大值. 默认为计算机的可用核心数 |
| `dev` | 如果为false，则跳过所有dev-only代码路径 |
| `verbose` | 启用日志记录 |