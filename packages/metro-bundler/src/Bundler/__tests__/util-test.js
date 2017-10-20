/**
 * Copyright (c) 2015-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 *
 * @emails oncall+javascript_foundation
 * @format
 */

'use strict';

const generator = require('babel-generator').default;
const util = require('../util');

it('generates the right AST for remote assets', () => {
  const asset = {
    __packager_asset: true,
    fileSystemLocation: '/js/RKJSModules/Apps/Wilde/AdsPayments/images',
    hash: '3e9b7b3c4d4fa37f9eb580dc426412dbde2925ff',
    height: 48,
    httpServerLocation: '/assets/RKJSModules/Apps/Wilde/AdsPayments/images',
    name: 'pending',
    scales: [1.5, 2, 3, 4],
    type: 'png',
    width: 48,
  };

  const map = {
    '/js/RKJSModules/Apps/Wilde/AdsPayments/images': {
      pending: {
        '2': 'img2x',
        '3': 'img3x',
      },
    },
  };

  const {ast} = util.generateRemoteAssetCodeFileAst(
    'gen',
    asset,
    'https://remote.server.com/',
    map,
  );

  const code = generator(ast, {minified: true}).code;

  expect(code).toBe(
    'module.exports={"uri":"https://remote.server.com/"+{"2":"img2x","3":"img3x"}[require("gen").pickScale([2,3])]};',
  );
});
