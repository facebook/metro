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

function isTypeScriptSource(fileName) {
  return !!fileName && fileName.endsWith('.ts');
}

function isTSXSource(fileName) {
  return !!fileName && fileName.endsWith('.tsx');
}

// Babel plugins required for each iOS (JSC) version can be found here
// https://github.com/babel/babel/blob/master/packages/babel-compat-data/data/plugins.json
const es6TransformsEnabledDefaultPlugins = [
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
  [require('@babel/plugin-transform-computed-properties')],
  [require('@babel/plugin-transform-destructuring')],
  [require('@babel/plugin-transform-function-name')],
  [require('@babel/plugin-transform-literals')],
  [require('@babel/plugin-transform-parameters')],
  [require('@babel/plugin-transform-shorthand-properties')],
  [require('@babel/plugin-transform-react-jsx')],
  [require('@babel/plugin-transform-regenerator')],
  [require('@babel/plugin-transform-sticky-regex')],
  [require('@babel/plugin-transform-unicode-regex')],
];

const es6TransformsDisabledDefaultPlugins = [
  [require('@babel/plugin-syntax-flow')],
  [require('@babel/plugin-proposal-optional-catch-binding')],
  [require('@babel/preset-modules/lib/plugins/transform-safari-for-shadowing')],
  [
    require('@babel/plugin-proposal-class-properties'),
    // use `this.foo = bar` instead of `this.defineProperty('foo', ...)`
    {loose: true},
  ],
  [require('@babel/plugin-syntax-dynamic-import')],
  [require('@babel/plugin-syntax-export-default-from')],
  [require('@babel/plugin-transform-react-jsx')],
  [require('@babel/plugin-transform-async-to-generator')],
  [require('@babel/plugin-transform-unicode-regex')],
];

const es2015ArrowFunctions = [
  require('@babel/plugin-transform-arrow-functions'),
];
const es2015Classes = [require('@babel/plugin-transform-classes')];
const es2015ForOf = [require('@babel/plugin-transform-for-of'), {loose: true}];
const es2015Spread = [require('@babel/plugin-transform-spread')];
const es2015TemplateLiterals = [
  require('@babel/plugin-transform-template-literals'),
  {loose: true}, // dont 'a'.concat('b'), just use 'a'+'b'
];
const taggedTemplateCaching = [
  require('@babel/preset-modules/lib/plugins/transform-tagged-template-caching'),
];
const exponentiationOperator = [
  require('@babel/plugin-transform-exponentiation-operator'),
];
const objectAssign = [require('@babel/plugin-transform-object-assign')];
const objectRestSpread = [require('@babel/plugin-proposal-object-rest-spread')];
const nullishCoalescingOperator = [
  require('@babel/plugin-proposal-nullish-coalescing-operator'),
  {loose: true},
];
const optionalChaining = [
  require('@babel/plugin-proposal-optional-chaining'),
  {loose: true},
];
const reactDisplayName = [
  require('@babel/plugin-transform-react-display-name'),
];
const reactJsxSource = [require('@babel/plugin-transform-react-jsx-source')];
const symbolMember = [require('../transforms/transform-symbol-member')];

function unstable_disableES6Transforms(options) {
  return !!(options && options.unstable_disableES6Transforms);
}

const getPreset = (src, options) => {
  const isNull = src == null;
  const hasClass = isNull || src.indexOf('class') !== -1;
  const hasForOf =
    isNull || (src.indexOf('for') !== -1 && src.indexOf('of') !== -1);

  const extraPlugins = [];
  const enableES6Transforms = !unstable_disableES6Transforms(options);

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

  if (enableES6Transforms && hasClass) {
    extraPlugins.push(es2015Classes);
  }

  // TODO(gaearon): put this back into '=>' indexOf bailout
  // and patch react-refresh to not depend on this transform.
  if (enableES6Transforms || (options && options.dev)) {
    extraPlugins.push(es2015ArrowFunctions);
  }

  if (isNull || hasClass || src.indexOf('...') !== -1) {
    if (enableES6Transforms) {
      extraPlugins.push(es2015Spread);
    }
    extraPlugins.push(objectRestSpread);
  }
  if (isNull || src.indexOf('`') !== -1) {
    extraPlugins.push(
      enableES6Transforms ? es2015TemplateLiterals : taggedTemplateCaching,
    );
  }
  if (isNull || src.indexOf('**') !== -1) {
    extraPlugins.push(exponentiationOperator);
  }
  if (enableES6Transforms && (isNull || src.indexOf('Object.assign') !== -1)) {
    extraPlugins.push(objectAssign);
  }
  if (enableES6Transforms && hasForOf) {
    extraPlugins.push(es2015ForOf);
  }
  if (enableES6Transforms && (hasForOf || src.indexOf('Symbol') !== -1)) {
    extraPlugins.push(symbolMember);
  }
  if (
    isNull ||
    src.indexOf('React.createClass') !== -1 ||
    src.indexOf('createReactClass') !== -1
  ) {
    extraPlugins.push(reactDisplayName);
  }
  if (isNull || src.indexOf('?.') !== -1) {
    extraPlugins.push(optionalChaining);
  }
  if (isNull || src.indexOf('??') !== -1) {
    extraPlugins.push(nullishCoalescingOperator);
  }

  if (options && options.dev) {
    extraPlugins.push(reactJsxSource);
  }

  if (!options || options.enableBabelRuntime !== false) {
    extraPlugins.push([
      require('@babel/plugin-transform-runtime'),
      {
        helpers: true,
        regenerator: enableES6Transforms,
      },
    ]);
  }

  let flowPlugins = {};
  if (!options || !options.disableFlowStripTypesTransform) {
    flowPlugins = {
      plugins: [require('@babel/plugin-transform-flow-strip-types')],
    };
  }

  return {
    comments: false,
    compact: true,
    overrides: [
      // the flow strip types plugin must go BEFORE class properties!
      // there'll be a test case that fails if you don't.
      flowPlugins,
      {
        plugins: enableES6Transforms
          ? es6TransformsEnabledDefaultPlugins
          : es6TransformsDisabledDefaultPlugins,
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
