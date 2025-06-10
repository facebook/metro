/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow strict-local
 * @format
 */

import {UnableToResolveError} from '../../node-haste/DependencyGraph/ModuleResolution';
import formatBundlingError from '../formatBundlingError';

describe('formatBundlingError', () => {
  test('UnableToResolveError', () => {
    expect(
      formatBundlingError(
        new UnableToResolveError('/origin/module.js', 'target', 'message'),
      ),
    ).toMatchObject({
      name: 'Error',
      type: 'UnableToResolveError',
      message:
        'Unable to resolve module target from /origin/module.js: message',
      originModulePath: '/origin/module.js',
      targetModuleName: 'target',
    });
  });
});
