/**
 * Copyright (c) 2004-present, Facebook, Inc.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @emails oncall+javascript_foundation
 * @flow
 * @format
 */

// Note: these tests were updated to snapshots

'use strict';

const fs = require('fs');
const path = require('path');

/*eslint-disable import/no-extraneous-dependencies*/
const {transformSync} = require('@babel/core');
const reactPlugin = require('../lib/index.js');

describe('finds React components', () => {
  const fixturesDir = path.join(__dirname, '__fixtures__');
  fs.readdirSync(fixturesDir).map(caseName => {
    it(`should ${caseName.split('-').join(' ')}`, () => {
      const fixtureDir = path.join(fixturesDir, caseName);
      const input = fs.readFileSync(
        path.join(fixtureDir, 'actual.js.es6'),
        'utf8',
      );
      const config = fs.readFileSync(
        path.join(fixtureDir, 'babel.json'),
        'utf8',
      );
      const output = transformSync(input, {
        babelrc: false,
        plugins: [
          [
            reactPlugin,
            // note: these originate from the .babelrc files from the real tests
            JSON.parse(config),
          ],
        ],
      }).code;

      expect(output).toMatchSnapshot();
    });
  });
});
