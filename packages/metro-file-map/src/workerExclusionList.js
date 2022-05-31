/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @format
 * @flow strict
 */

// This list is compiled after the MDN list of the most common MIME types (see
// https://developer.mozilla.org/en-US/docs/Web/HTTP/Basics_of_HTTP/MIME_types/
// Complete_list_of_MIME_types).
//
// Only MIME types starting with "image/", "video/", "audio/" and "font/" are
// reflected in the list. Adding "application/" is too risky since some text
// file formats (like ".js" and ".json") have an "application/" MIME type.
//
// Feel free to add any extensions that cannot be a Haste module.

'use strict';

const extensions /*: $ReadOnlySet<string> */ = new Set([
  // JSONs are never haste modules, except for "package.json", which is handled.
  '.json',

  // Image extensions.
  '.bmp',
  '.gif',
  '.ico',
  '.jpeg',
  '.jpg',
  '.png',
  '.svg',
  '.tiff',
  '.tif',
  '.webp',

  // Video extensions.
  '.avi',
  '.mp4',
  '.mpeg',
  '.mpg',
  '.ogv',
  '.webm',
  '.3gp',
  '.3g2',

  // Audio extensions.
  '.aac',
  '.midi',
  '.mid',
  '.mp3',
  '.oga',
  '.wav',
  '.3gp',
  '.3g2',

  // Font extensions.
  '.eot',
  '.otf',
  '.ttf',
  '.woff',
  '.woff2',
]);

module.exports = extensions;
