/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow
 * @format
 */

'use strict';

module.exports = (async () => {
  const defaultConfig = await require('./index')('/path/to/project');
  const validConfig = {
    ...defaultConfig,
    resolver: {
      ...defaultConfig.resolver,
      resolveRequest: function CustomResolver() {},
      hasteImplModulePath: './path',
    },
    server: {
      ...defaultConfig.server,
      unstable_serverRoot: '',
    },
    transformer: {
      ...defaultConfig.transformer,
      getTransformOptions: function getTransformOptions() {},
    },
    serializer: {
      ...defaultConfig.serializer,
      customSerializer: function customSerializer() {},
    },
  };

  return validConfig;
}: () => any);
