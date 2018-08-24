/**
 * Copyright (c) 2018-present, Facebook, Inc.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @emails oncall+js_foundation
 * @format
 */
'use strict';

const importExportPlugin = require('../import-export-plugin');

const {compare} = require('../test-helpers');

it('correctly transforms and extracts "import" statements', () => {
  const code = `
    import v from 'foo';
    import * as w from 'bar';
    import {x} from 'baz';
    import {y as z} from 'qux';
    import 'side-effect';
  `;

  const expected = `
    require('side-effect');
    const z = require('qux').y;
    const x = require('baz').x;
    const w = _$$_IMPORT_ALL('bar');
    const v = _$$_IMPORT_DEFAULT('foo');
  `;

  compare([importExportPlugin], code, expected);
});

it('correctly transforms complex patterns', () => {
  const code = `
    import a, * as b from 'foo';
    import c, {d as e, f} from 'bar';
  `;

  const expected = `
    const c = _$$_IMPORT_DEFAULT('bar');
    const e = require('bar').d;
    const f = require('bar').f;
    const a = _$$_IMPORT_DEFAULT('foo');
    const b = _$$_IMPORT_ALL('foo');
  `;

  compare([importExportPlugin], code, expected);
});

it('hoists declarations to the top', () => {
  const code = `
    foo();
    import {foo} from 'bar';
  `;

  const expected = `
    const foo = require('bar').foo;
    foo();
  `;

  compare([importExportPlugin], code, expected);
});
