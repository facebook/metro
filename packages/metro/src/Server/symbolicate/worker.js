/**
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @format
 */

'use strict';

const SourceMapConsumer = require('source-map').SourceMapConsumer;
const Symbolication = require('metro-symbolicate/src/Symbolication');

const concat = require('concat-stream');
const net = require('net');

process.once('message', socket => {
  net
    .createServer({allowHalfOpen: true}, connection => {
      connection.setEncoding('utf8');
      connection.pipe(
        concat(
          data => symbolicate(connection, data).catch(console.error), // log the error as a last resort
        ),
      );
    })
    .listen(socket, () => process.send(null));
});

function symbolicate(connection, data) {
  return Promise.resolve(data)
    .then(JSON.parse)
    .then(symbolicateStack)
    .then(JSON.stringify)
    .catch(makeErrorMessage)
    .then(message => connection.end(message));
}

function symbolicateStack(data) {
  const contexts = new Map(data.maps.map(mapToContext));
  return {
    result: data.stack.map(frame => mapFrame(frame, contexts)),
  };
}

function mapFrame(frame, contexts) {
  const sourceUrl = frame.file;
  const context = contexts.get(sourceUrl);
  if (context == null) {
    return frame;
  }
  const original = Symbolication.getOriginalPositionFor(
    frame.lineNumber,
    frame.column,
    null, // No module IDs in DEV
    context,
  );
  if (!original || !original.source) {
    return frame;
  }
  return Object.assign({}, frame, {
    file: original.source,
    lineNumber: original.line,
    column: original.column,
    methodName: original.name || frame.methodName,
  });
}

function makeErrorMessage(error) {
  return JSON.stringify({
    error: String((error && error.message) || error),
  });
}

function mapToContext(tuple) {
  tuple[1] = Symbolication.createContext(SourceMapConsumer, tuple[1]);
  return tuple;
}

// for testing
exports.symbolicate = symbolicate;
