/**
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow
 * @format
 */

/* eslint-env browser */

'use strict';

const Tippy = require('tippy.js');

const filesize = require('filesize');

const {injectGlobal} = require('emotion');

opaque type CyNode = Object;

function showTooltip(node: CyNode) {
  let tippy = node.data('tippy');
  if (tippy != null) {
    tippy.show();
    return;
  }

  tippy = new Tippy(node.popperRef(), {
    html: (() => {
      const content = document.createElement('div');
      content.innerHTML = filesize(node.data('size'));
      return content;
    })(),
    trigger: 'manual',
    theme: 'custom-light',
    placement: 'bottom',
  }).tooltips[0];

  node.data('tippy', tippy);
  tippy.show();
}

function hideTooltip(node: CyNode) {
  const tippy = node.data('tippy');
  if (tippy != null) {
    tippy.hide();
  }
}

injectGlobal`
  .tippy-tooltip.custom-light-theme .tippy-arrow{
     border-top:7px solid #fff;
     border-right:7px solid transparent;
     border-left:7px solid transparent
  }
  .tippy-tooltip.custom-light-theme{
     color:#26323d;
     box-shadow:0 0 20px 4px rgba(154,161,177,.15),0 4px 80px -8px rgba(36,40,47,.25),0 4px 4px -2px rgba(91,94,105,.15);
     background-color:#fff
  }
  .tippy-tooltip.custom-light-theme .tippy-backdrop{
     background-color:#fff
  }
  .tippy-tooltip.custom-light-theme[data-animatefill]{
     background-color:transparent
  }
`;

module.exports = {showTooltip, hideTooltip};
