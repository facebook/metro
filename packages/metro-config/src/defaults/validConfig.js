/**
 * Copyright (c) 2015-present, Facebook, Inc.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow
 * @format
 */
'use strict';

module.exports = async () => {
  const defaultConfig = await require('./index')('/path/to/project');
  const validConfig = {
    ...defaultConfig,
    resolver: {
      ...defaultConfig.resolver,
      resolveRequest: function CustomResolver() {},
      hasteImplModulePath: './path',
    },
  };

  return validConfig;
};
