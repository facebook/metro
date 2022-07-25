/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @emails oncall+metro_bundler
 * @flow strict-local
 * @format
 */

import type {InterfaceExtends} from '@babel/types';

export function isTurboModule(i: InterfaceExtends): boolean {
  return (
    i.id.name === 'TurboModule' &&
    (i.typeParameters == null || i.typeParameters.params.length === 0)
  );
}
