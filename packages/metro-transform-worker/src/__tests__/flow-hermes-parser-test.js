/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow
 * @format
 * @oncall react_native
 */

'use strict';

const {transformJS} = require('../index');

describe('Flow hermes-parser auto-detection', () => {
  const baseConfig = {
    asyncRequireModulePath: 'metro/asyncRequire',
    babelTransformerPath: 'metro-babel-transformer',
    minifierPath: 'metro-minify-terser',
    optimizationSizeLimit: 150000,
    transformerPath: 'metro-transform-worker',
  };

  const baseOptions = {
    dev: false,
    hot: false,
    inlinePlatform: false,
    inlineRequires: false,
    minify: false,
    platform: 'ios',
    type: 'module',
  };

  const projectRoot = '/root';

  test('uses hermes-parser for files with @flow pragma', async () => {
    const flowCode = `
      // @flow
      export function test(x: number): number {
        return x + 1;
      }
    `;

    const file = {
      ast: null,
      code: flowCode,
      filename: '/root/test.js',
      functionMap: null,
      type: 'js/module',
    };

    const mockParse = jest.fn();
    jest.doMock('hermes-parser', () => ({
      parse: mockParse.mockReturnValue({
        type: 'File',
        program: {
          type: 'Program',
          body: [],
          directives: [],
        },
      }),
    }));

    await transformJS(file, {config: baseConfig, options: baseOptions, projectRoot});
    
    expect(mockParse).toHaveBeenCalledWith(flowCode, {
      babel: true,
      sourceType: 'module',
    });
  });

  test('uses hermes-parser for Flow component syntax', async () => {
    const componentCode = `
      const MyComponent: component(props: Props) = (props) => {
        return <div>{props.text}</div>;
      };
    `;

    const file = {
      ast: null,
      code: componentCode,
      filename: '/root/MyComponent.js',
      functionMap: null,
      type: 'js/module',
    };

    const mockParse = jest.fn();
    jest.doMock('hermes-parser', () => ({
      parse: mockParse.mockReturnValue({
        type: 'File',
        program: {
          type: 'Program',
          body: [],
          directives: [],
        },
      }),
    }));

    await transformJS(file, {config: baseConfig, options: baseOptions, projectRoot});
    
    expect(mockParse).toHaveBeenCalledWith(componentCode, {
      babel: true,
      sourceType: 'module',
    });
  });

  test('respects explicit hermesParser config option', async () => {
    const jsCode = `
      // Regular JavaScript without Flow
      export function test(x) {
        return x + 1;
      }
    `;

    const file = {
      ast: null,
      code: jsCode,
      filename: '/root/test.js',
      functionMap: null,
      type: 'js/module',
    };

    const configWithHermes = {
      ...baseConfig,
      hermesParser: true,
    };

    const mockParse = jest.fn();
    jest.doMock('hermes-parser', () => ({
      parse: mockParse.mockReturnValue({
        type: 'File',
        program: {
          type: 'Program',
          body: [],
          directives: [],
        },
      }),
    }));

    await transformJS(file, {
      config: configWithHermes,
      options: baseOptions,
      projectRoot,
    });
    
    expect(mockParse).toHaveBeenCalled();
  });
});