/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @format
 */

import type * as $$IMPORT_TYPEOF_1$$ from '@babel/core';
import type {PluginObj} from '@babel/core';

type Babel = typeof $$IMPORT_TYPEOF_1$$;
export type PluginOptions = Readonly<{
  ignoredRequires?: ReadonlyArray<string>;
  inlineableCalls?: ReadonlyArray<string>;
  nonMemoizedModules?: ReadonlyArray<string>;
  memoizeCalls?: boolean;
}>;
export type State = {
  opts?: PluginOptions;
  ignoredRequires: Set<string>;
  inlineableCalls: Set<string>;
  membersAssigned: Map<string, Set<string>>;
};
/**
 * This transform inlines top-level require(...) aliases with to enable lazy
 * loading of dependencies. It is able to inline both single references and
 * child property references.
 *
 * For instance:
 *     var Foo = require('foo');
 *     f(Foo);
 *
 * Will be transformed into:
 *     f(require('foo'));
 *
 * When the assigment expression has a property access, it will be inlined too,
 * keeping the property. For instance:
 *     var Bar = require('foo').bar;
 *     g(Bar);
 *
 * Will be transformed into:
 *     g(require('foo').bar);
 *
 * Destructuring also works the same way. For instance:
 *     const {Baz} = require('foo');
 *     h(Baz);
 *
 * Is also successfully inlined into:
 *     g(require('foo').Baz);
 */
declare const $$EXPORT_DEFAULT_DECLARATION$$: (
  $$PARAM_0$$: Babel,
) => PluginObj<State>;
declare type $$EXPORT_DEFAULT_DECLARATION$$ =
  typeof $$EXPORT_DEFAULT_DECLARATION$$;
export default $$EXPORT_DEFAULT_DECLARATION$$;
