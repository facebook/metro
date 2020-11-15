/**
 * See "https://github.com/babel/babel/blob/master/packages/babel-compat-data/data/plugins.json"
 */
const es2015Plugins = [
  require('@babel/plugin-transform-arrow-functions'), // iOS 10
  require('@babel/plugin-transform-classes'), // iOS 10
  require('@babel/plugin-transform-computed-properties'), // iOS 8
  require('@babel/plugin-transform-destructuring'), // iOS 10
  require('@babel/plugin-transform-function-name'), // iOS 10
  require('@babel/plugin-transform-literals'), // iOS 9
  require('@babel/plugin-transform-parameters'), // iOS 10
  require('@babel/plugin-transform-sticky-regex'), // iOS 10
  require('@babel/plugin-transform-for-of'), // iOS 10
  require('@babel/plugin-transform-shorthand-properties'), // iOS 9
  require('@babel/plugin-transform-spread'), // iOS 10
  require('@babel/plugin-transform-object-assign'), // iOS 10
  require('@babel/plugin-transform-exponentiation-operator'), // iOS 10.3
];

/**
 * Safari ~11 has an issue where variable declarations in a For statement throw if they shadow parameters.
 * This is fixed by renaming any declarations in the left/init part of a For* statement so they don't shadow.
 * @see https://bugs.webkit.org/show_bug.cgi?id=171041
 *
 * @example
 *   e => { for (let e of []) e }   // throws
 *   e => { for (let _e of []) _e }   // works
 */
const transformBlockScoping = require('@babel/plugin-transform-block-scoping');
const safariForShadowing = require('@babel/preset-modules/lib/plugins/transform-safari-for-shadowing');

/**
 * Converts destructured parameters with default values to non-shorthand syntax.
 * This fixes the only Tagged Templates-related bug in ES Modules-supporting browsers (Safari 10 & 11).
 * Use this plugin instead of `@babel/plugin-transform-template-literals` when targeting ES Modules.
 *
 * @example
 *   // Bug 1: Safari 10/11 doesn't reliably return the same Strings value.
 *   // The value changes depending on invocation and function optimization state.
 *   function f() { return Object`` }
 *   f() === new f()  // false, should be true.
 *
 * @example
 *   // Bug 2: Safari 10/11 use the same cached strings value when the string parts are the same.
 *   // This behavior comes from an earlier version of the spec, and can cause tricky bugs.
 *   Object``===Object``  // true, should be false.
 */
const transformTemplateLiterals = require('@babel/plugin-transform-template-literals');
const taggedTemplateCaching = require('@babel/preset-modules/lib/plugins/transform-tagged-template-caching');

/**
 * JavaScriptCore implements generator functions, so we replace the regenerator runtime
 * with the `async-to-generator` transform.
 */
const transformRegenerator = require('@babel/plugin-transform-regenerator');
const transformAsyncToGenerator = require('@babel/plugin-transform-async-to-generator');
const transformRuntime = require('@babel/plugin-transform-runtime');

function isNeeededForES2015([plugin]) {
  return !es2015Plugins.includes(plugin);
}

function filterES2015Plugins(plugins) {
  const updatedPlugins = plugins.filter(isNeeededForES2015).map(plugin => {
    if (plugin[0] === transformBlockScoping) {
      return [safariForShadowing];
    } else if (plugin[0] === transformTemplateLiterals) {
      return [taggedTemplateCaching];
    } else if (plugin[0] === transformRegenerator) {
      return [transformAsyncToGenerator];
    } else if (plugin[0] === transformRuntime) {
      return [transformRuntime, {helpers: true, regenerator: false}];
    } else {
      return plugin;
    }
  });
  return updatedPlugins;
}

module.exports = filterES2015Plugins;
