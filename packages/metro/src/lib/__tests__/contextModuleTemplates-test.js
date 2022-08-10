/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow
 * @format
 */

import {getContextModuleTemplate} from '../contextModuleTemplates';

describe('getContextModuleTemplate', () => {
  it(`creates a sync template`, () => {
    const template = getContextModuleTemplate('sync', '/path/to/project/src', [
      '/path/to/project/src/foo.js',
    ]);
    expect(template).toMatch(/foo\.js/);
    expect(template).toMatchSnapshot();
  });
  it(`creates an empty template`, () => {
    const template = getContextModuleTemplate(
      'sync',
      '/path/to/project/src',
      [],
    );
    expect(template).toMatch(/MODULE_NOT_FOUND/);
    expect(template).toMatchSnapshot();
  });
  it(`creates an eager template`, () => {
    const template = getContextModuleTemplate('eager', '/path/to/project/src', [
      '/path/to/project/src/foo.js',
    ]);
    expect(template).toMatchSnapshot();
  });
  it(`creates a lazy template`, () => {
    const template = getContextModuleTemplate('lazy', '/path/to/project/src', [
      '/path/to/project/src/foo.js',
    ]);
    expect(template).toMatchSnapshot();
  });
  it(`creates a lazy-once template`, () => {
    const template = getContextModuleTemplate(
      'lazy-once',
      '/path/to/project/src',
      ['/path/to/project/src/foo.js', '/path/to/project/src/another/bar.js'],
    );

    expect(template).toMatchSnapshot();
  });
});
