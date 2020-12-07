/**
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @format
 */

'use strict';

const lazyImports = require('./lazy-imports');
const passthroughSyntaxPlugins = require('../passthrough-syntax-plugins');

function isTypeScriptSource(fileName) {
  return !!fileName && fileName.endsWith('.ts');
}

function isTSXSource(fileName) {
  return !!fileName && fileName.endsWith('.tsx');
}

const defaultPlugins = [
  [require('@babel/plugin-syntax-flow')],
  [require('@babel/plugin-proposal-optional-catch-binding')],
  [require('@babel/plugin-transform-block-scoping')],
  [
    require('@babel/plugin-proposal-class-properties'),
    // use `this.foo = bar` instead of `this.defineProperty('foo', ...)`
    {loose: true},
  ],
  [require('@babel/plugin-syntax-dynamic-import')],
  [require('@babel/plugin-syntax-export-default-from')],
  ...passthroughSyntaxPlugins,
  [require('@babel/plugin-transform-destructuring')],
  [require('@babel/plugin-transform-function-name')],
  [require('@babel/plugin-transform-literals')],
  [require('@babel/plugin-transform-parameters')],
  [require('@babel/plugin-transform-regenerator')],
  [require('@babel/plugin-transform-sticky-regex')],
  [require('@babel/plugin-transform-unicode-regex')],
];

const getPreset = (src, options) => {
  const transformProfile =
    (options && options.unstable_transformProfile) || 'default';
  const isHermesStable = transformProfile === 'hermes-stable';
  const isHermesCanary = transformProfile === 'hermes-canary';
  const isHermes = isHermesStable || isHermesCanary;

  const isNull = src == null;
  const hasClass = isNull || src.indexOf('class') !== -1;
  const hasForOf =
    isNull || (src.indexOf('for') !== -1 && src.indexOf('of') !== -1);

  const extraPlugins = [];
  if (!options.useTransformReactJSXExperimental) {
    extraPlugins.push([require('@babel/plugin-transform-react-jsx')]);
  }

  if (!options || !options.disableImportExportTransform) {
    extraPlugins.push(
      [require('@babel/plugin-proposal-export-default-from')],
      [
        require('@babel/plugin-transform-modules-commonjs'),
        {
          strict: false,
          strictMode: false, // prevent "use strict" injections
          lazy:
            options && options.lazyImportExportTransform != null
              ? options.lazyImportExportTransform
              : importSpecifier => lazyImports.has(importSpecifier),
          allowTopLevelThis: true, // dont rewrite global `this` -> `undefined`
        },
      ],
    );
  }

  if (hasClass) {
    extraPlugins.push([require('@babel/plugin-transform-classes')]);
  }

  // TODO(gaearon): put this back into '=>' indexOf bailout
  // and patch react-refresh to not depend on this transform.
  extraPlugins.push([require('@babel/plugin-transform-arrow-functions')]);

  if (!isHermes) {
    extraPlugins.push([require('@babel/plugin-transform-computed-properties')]);
  }
  if (!isHermes && (isNull || hasClass || src.indexOf('...') !== -1)) {
    extraPlugins.push(
      [require('@babel/plugin-transform-spread')],
      [
        require('@babel/plugin-proposal-object-rest-spread'),
        // Assume no dependence on getters or evaluation order. See https://github.com/babel/babel/pull/11520
        {loose: true},
      ],
    );
  }
  if (!isHermes && (isNull || src.indexOf('`') !== -1)) {
    extraPlugins.push([
      require('@babel/plugin-transform-template-literals'),
      {loose: true}, // dont 'a'.concat('b'), just use 'a'+'b'
    ]);
  }
  if (!isHermes && (isNull || src.indexOf('**') !== -1)) {
    extraPlugins.push([
      require('@babel/plugin-transform-exponentiation-operator'),
    ]);
  }
  if (!isHermes && (isNull || src.indexOf('Object.assign')) !== -1) {
    extraPlugins.push([require('@babel/plugin-transform-object-assign')]);
  }
  if (hasForOf) {
    extraPlugins.push([
      require('@babel/plugin-transform-for-of'),
      {loose: true},
    ]);
  }
  if (
    isNull ||
    src.indexOf('React.createClass') !== -1 ||
    src.indexOf('createReactClass') !== -1
  ) {
    extraPlugins.push([require('@babel/plugin-transform-react-display-name')]);
  }
  if (!isHermes && (isNull || src.indexOf('?.') !== -1)) {
    extraPlugins.push([
      require('@babel/plugin-proposal-optional-chaining'),
      {loose: true},
    ]);
  }
  if (isNull || src.indexOf('??') !== -1) {
    extraPlugins.push([
      require('@babel/plugin-proposal-nullish-coalescing-operator'),
      {loose: true},
    ]);
  }
  if (!isHermes) {
    extraPlugins.push([
      require('@babel/plugin-transform-shorthand-properties'),
    ]);
  }

  if (options && options.dev && !options.useTransformReactJSXExperimental) {
    extraPlugins.push([require('@babel/plugin-transform-react-jsx-source')]);
    extraPlugins.push([require('@babel/plugin-transform-react-jsx-self')]);
  }

  if (!options || options.enableBabelRuntime !== false) {
    extraPlugins.push([
      require('@babel/plugin-transform-runtime'),
      {
        helpers: true,
        regenerator: true,
      },
    ]);
  }

  return {
    comments: false,
    compact: true,
    overrides: [
      // the flow strip types plugin must go BEFORE class properties!
      // there'll be a test case that fails if you don't.
      {
        plugins: [require('@babel/plugin-transform-flow-strip-types')],
      },
      {
        plugins: defaultPlugins,
      },
      {
        test: isTypeScriptSource,
        plugins: [
          [
            require('@babel/plugin-transform-typescript'),
            {
              isTSX: false,
              allowNamespaces: true,
            },
          ],
        ],
      },
      {
        test: isTSXSource,
        plugins: [
          [
            require('@babel/plugin-transform-typescript'),
            {
              isTSX: true,
              allowNamespaces: true,
            },
          ],
        ],
      },
      {
        plugins: extraPlugins,
      },
    ],
  };
};

module.exports = options => {
  if (options.withDevTools == null) {
    const env = process.env.BABEL_ENV || process.env.NODE_ENV;
    if (!env || env === 'development') {
      return getPreset(null, {...options, dev: true});
    }
  }
  return getPreset(null, options);
};

module.exports.getPreset = getPreset;
