/**
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow strict-local
 * @format
 */

'use strict';

import type {NodePath} from '@babel/traverse';
import typeof * as Types from '@babel/types';
import type {CallExpression} from '@babel/types';

type State = {|
  opts: {|
    +dependencyIds: $ReadOnlyArray<number>,
    +globalPrefix: string,
  |},
|};

function reverseDependencyMapReferences({
  types: t,
}: {
  types: Types,
  ...
}): {|
  visitor: {|
    CallExpression: (path: NodePath<CallExpression>, state: State) => void,
  |},
|} {
  return {
    visitor: {
      CallExpression(path: NodePath<CallExpression>, state: State) {
        const {node} = path;

        if (node.callee.name === `${state.opts.globalPrefix}__d`) {
          // $FlowFixMe Flow error uncovered by typing Babel more strictly
          const lastArg = node.arguments[0].params.slice(-1)[0];
          // $FlowFixMe Flow error uncovered by typing Babel more strictly
          const depMapName = lastArg && lastArg.name;

          if (!depMapName) {
            return;
          }

          // $FlowFixMe Flow error uncovered by typing Babel more strictly
          const scope = path.get('arguments.0.body').scope;
          const binding = scope.getBinding(depMapName);

          binding.referencePaths.forEach(({parentPath}) => {
            const memberNode = parentPath.node;

            if (
              memberNode.type === 'MemberExpression' &&
              memberNode.property.type === 'NumericLiteral'
            ) {
              parentPath.replaceWith(
                t.numericLiteral(
                  state.opts.dependencyIds[memberNode.property.value],
                ),
              );
            }
          });
        }
      },
    },
  };
}

module.exports = reverseDependencyMapReferences;
