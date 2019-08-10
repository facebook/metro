/**
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @emails oncall+metro_bundler
 * @format
 */

'use strict';

const Metro = require('../../..');
const RamBundleParser = require('../../lib/RamBundleParser');

const fs = require('fs');
const os = require('os');
const path = require('path');
const ramBundleOutput = require('../../shared/output/unbundle');
const vm = require('vm');

jest.unmock('cosmiconfig');

jest.setTimeout(30 * 1000);

it('builds and executes a RAM bundle', async () => {
  const config = await Metro.loadConfig({
    config: require.resolve('../metro.config.js'),
  });
  const bundlePath = path.join(os.tmpdir(), 'rambundle.js');

  try {
    await Metro.runBuild(config, {
      entry: 'TestBundle.js',
      output: ramBundleOutput,
      out: bundlePath,
    });

    const bundleBuffer = fs.readFileSync(bundlePath);
    const parser = new RamBundleParser(bundleBuffer);

    // Create a context with a global nativeRequire function, which reads the
    // module code from the RAM bundle and injects it into the VM.
    const context = vm.createContext({
      nativeRequire(id) {
        vm.runInContext(parser.getModule(id), context);
      },
    });

    expect(vm.runInContext(parser.getStartupCode(), context)).toMatchSnapshot();
  } finally {
    fs.unlinkSync(bundlePath);
  }
});
