/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @emails oncall+metro_bundler
 * @format
 */

'use strict';

const Metro = require('../../..');
const path = require('path');

jest.unmock('cosmiconfig');

jest.setTimeout(120 * 1000);

it('should build the dependency graph', async () => {
  const entryPoint = path.resolve(
    __dirname,
    '..',
    'basic_bundle',
    'TestBundle.js',
  );

  const config = await Metro.loadConfig({
    config: require.resolve('../metro.config.js'),
  });

  const graph = await Metro.buildGraph(config, {
    entries: [entryPoint],
  });

  expect(
    Array.from(graph.dependencies.entries()).map(([filePath, dep]) => ({
      file: path.basename(filePath),
      types: dep.output.map(output => output.type),
    })),
  ).toEqual([
    {file: 'TestBundle.js', types: ['js/module']},
    {file: 'Bar.js', types: ['js/module']},
    {file: 'Foo.js', types: ['js/module']},
    {file: 'test.png', types: ['js/module/asset']},
    {file: 'AssetRegistry.js', types: ['js/module']},
    {file: 'TypeScript.ts', types: ['js/module']},
  ]);

  expect(graph.dependencies.get(entryPoint)).toEqual(
    expect.objectContaining({
      path: entryPoint,
      inverseDependencies: new Set(),
      output: [
        expect.objectContaining({
          type: 'js/module',
        }),
      ],
    }),
  );

  expect(graph.dependencies.get(entryPoint).output).toMatchSnapshot();
});
