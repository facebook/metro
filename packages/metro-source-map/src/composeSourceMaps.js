/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow
 * @format
 */

'use strict';

import type {SourcePosition} from './Consumer/types.flow';
import type {IConsumer, MixedSourceMap} from './source-map';
import type {Number0, Number1} from 'ob1';

const Consumer = require('./Consumer');
const {SourceMapGenerator} = require('source-map');

// TODO(t67648443): Bypass the `sort-requires` rule for this file because of a dependency cycle.
Consumer;

// Originally based on https://github.com/jakobwesthoff/source-map-merger
function composeSourceMaps(
  maps: $ReadOnlyArray<MixedSourceMap>,
): MixedSourceMap {
  // NOTE: require() here to break dependency cycle
  const SourceMetadataMapConsumer = require('metro-symbolicate/src/SourceMetadataMapConsumer');
  if (maps.length < 1) {
    throw new Error('composeSourceMaps: Expected at least one map');
  }
  const firstMap = maps[0];

  const consumers = maps
    .map(function (map) {
      return new Consumer(map);
    })
    .reverse();

  const generator = new SourceMapGenerator({
    file: consumers[0].file,
  });

  consumers[0].eachMapping(mapping => {
    const original = findOriginalPosition(
      consumers,
      mapping.generatedLine,
      mapping.generatedColumn,
    );
    generator.addMapping({
      generated: {
        line: mapping.generatedLine,
        column: mapping.generatedColumn,
      },
      original:
        original.line != null
          ? {
              line: original.line,
              column: original.column,
            }
          : null,
      source: original.source,
      name: original.name,
    });
  });

  const composedMap = generator.toJSON();

  composedMap.sourcesContent = composedMap.sources.map(source =>
    consumers[consumers.length - 1].sourceContentFor(source, true),
  );
  if (composedMap.sourcesContent.every(content => content == null)) {
    delete composedMap.sourcesContent;
  }
  const metadataConsumer = new SourceMetadataMapConsumer(firstMap);
  composedMap.x_facebook_sources = metadataConsumer.toArray(
    composedMap.sources,
  );
  const function_offsets = maps[maps.length - 1].x_hermes_function_offsets;
  if (function_offsets) {
    composedMap.x_hermes_function_offsets = function_offsets;
  }
  return composedMap;
}

function findOriginalPosition(
  consumers: $ReadOnlyArray<IConsumer>,
  generatedLine: Number1,
  generatedColumn: Number0,
): {
  line: ?number,
  column: ?number,
  source: ?string,
  name: ?string,
  ...
} {
  let currentLine: ?Number1 = generatedLine;
  let currentColumn: ?Number0 = generatedColumn;
  let original: SourcePosition = {
    line: null,
    column: null,
    source: null,
    name: null,
  };

  for (const consumer of consumers) {
    if (currentLine == null || currentColumn == null) {
      return {line: null, column: null, source: null, name: null};
    }
    original = consumer.originalPositionFor({
      line: currentLine,
      column: currentColumn,
    });

    currentLine = original.line;
    currentColumn = original.column;

    if (currentLine == null) {
      return {
        line: null,
        column: null,
        source: null,
        name: null,
      };
    }
  }
  // $FlowFixMe[incompatible-return] `Number0`, `Number1` is incompatible with number
  return original;
}

module.exports = composeSourceMaps;
