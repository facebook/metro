/**
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @emails oncall+js_foundation
 * @format
 */

'use strict';

const bundleToString = require('../bundleToString');

describe('bundleToString', () => {
  it('serializes a bundle into a plain JS bundle', () => {
    expect(
      bundleToString({
        base: true,
        revisionId: 'revisionId',
        pre: 'console.log("Hello World!");',
        post: 'console.log("That\'s all folks!");',
        modules: [[0, 'console.log("Best module.");']],
      }),
    ).toMatchInlineSnapshot(`
"console.log(\\"Hello World!\\");
console.log(\\"Best module.\\");
console.log(\\"That's all folks!\\");"
`);
  });

  it('modules are sorted by id', () => {
    expect(
      bundleToString({
        base: true,
        revisionId: 'revisionId',
        pre: 'console.log("Hello World!");',
        post: 'console.log("That\'s all folks!");',
        modules: [[3, '3'], [0, '0'], [2, '2'], [1, '1']],
      }),
    ).toMatchInlineSnapshot(`
"console.log(\\"Hello World!\\");
0
1
2
3
console.log(\\"That's all folks!\\");"
`);
  });
});
