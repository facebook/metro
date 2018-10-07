/**
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @format
 */

'use strict';

function isTypeScriptSource(fileName) {
  return !!fileName && fileName.endsWith('.ts');
}

function isTSXSource(fileName) {
  return !!fileName && fileName.endsWith('.tsx');
}

const defaultPlugins = [
  [require('@babel/plugin-proposal-optional-catch-binding')],
  [require('@babel/plugin-transform-block-scoping')],
  // the flow strip types plugin must go BEFORE class properties!
  // there'll be a test case that fails if you don't.
  [require('@babel/plugin-transform-flow-strip-types')],
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

const es2015ExportDefault = [
  require('@babel/plugin-proposal-export-default-from'),
];

const es2015ImportExport = [
  require('@babel/plugin-transform-modules-commonjs'),
  {
    strict: false,
    strictMode: false, // prevent "use strict" injections
    allowTopLevelThis: true, // dont rewrite global `this` -> `undefined`
  },
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

const babelRuntime = [
  require('@babel/plugin-transform-runtime'),
  {
    helpers: true,
    regenerator: true,
  },
];

const getPreset = (src, options) => {
  const isNull = src == null;
  const hasClass = isNull || src.indexOf('class') !== -1;
  const hasForOf =
    isNull || (src.indexOf('for') !== -1 && src.indexOf('of') !== -1);

  const extraPlugins = [];

  if (!options || !options.disableImportExportTransform) {
    extraPlugins.push(es2015ImportExport, es2015ExportDefault);
  }

  if (hasClass) {
    extraPlugins.push(es2015Classes);
  }
  if (isNull || src.indexOf('=>') !== -1) {
    extraPlugins.push(es2015ArrowFunctions);
  }
  if (isNull || hasClass || src.indexOf('...') !== -1) {
    extraPlugins.push(es2015Spread);
    extraPlugins.push(objectRestSpread);
  }
  if (isNull || src.indexOf('`') !== -1) {
    extraPlugins.push(es2015TemplateLiterals);
  }
  if (isNull || src.indexOf('**') !== -1) {
    extraPlugins.push(exponentiationOperator);
  }
  if (isNull || src.indexOf('Object.assign') !== -1) {
    extraPlugins.push(objectAssign);
  }
  if (hasForOf) {
    extraPlugins.push(es2015ForOf);
  }
  if (hasForOf || src.indexOf('Symbol') !== -1) {
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
    extraPlugins.push(babelRuntime);
  }

  return {
    comments: false,
    compact: true,
    overrides: [
      {
        plugins: defaultPlugins,
      },
      {
        test: isTypeScriptSource,
        plugins: [
          [require('@babel/plugin-transform-typescript'), {isTSX: false}],
        ],
      },
      {
        test: isTSXSource,
        plugins: [
          [require('@babel/plugin-transform-typescript'), {isTSX: true}],
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
