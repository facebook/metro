/**
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow
 * @format
 */

/**
 * This theme was inspired from the VS Code One Dark Pro theme, under the
 * MIT License:
 * https://github.com/Binaryify/OneDark-Pro
 */

'use strict';

var theme = {
  plain: {
    color: '#e06c75',
    backgroundColor: '#282c34',
  },
  styles: [
    {
      types: ['comment'],
      style: {
        color: '#7F848E',
      },
    },
    {
      types: ['string', 'attr-value', 'style'],
      style: {
        color: '#98c379',
      },
    },
    {
      types: ['punctuation'],
      style: {
        color: '#A6B2C0',
      },
    },
    {
      types: ['regex'],
      style: {
        color: '#98c379',
      },
    },
    {
      types: ['deleted', 'tag', 'property'],
      style: {
        color: 'rgb(224, 108, 117)',
      },
    },
    {
      types: ['operator', 'symbol'],
      style: {
        color: 'rgb(86, 182, 194)',
      },
    },
    {
      types: ['variable'],
      style: {
        color: 'rgb(166, 178, 192)',
      },
    },
    {
      types: ['changed'],
      style: {
        color: 'rgb(224, 194, 133)',
      },
    },
    {
      types: ['inserted', 'char'],
      style: {
        color: 'rgb(152, 195, 121)',
      },
    },
    {
      types: ['attr-name', 'comment'],
      style: {
        fontStyle: 'italic',
      },
    },
    {
      types: ['builtin', 'number'],
      style: {
        color: 'rgb(209, 154, 102)',
      },
    },
    {
      types: ['function'],
      style: {
        color: 'rgb(97, 175, 239)',
      },
    },
    {
      types: ['namespace', 'class-name'],
      style: {
        color: 'rgb(229, 192, 123)',
      },
    },
    {
      types: ['keyword', 'selector'],
      style: {
        color: 'rgb(198, 120, 221)',
      },
    },
  ],
};

module.exports = theme;
