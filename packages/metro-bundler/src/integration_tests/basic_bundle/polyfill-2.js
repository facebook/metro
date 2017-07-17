// Copyright 2004-present Facebook. All Rights Reserved.

'use strict';

/* eslint-disable no-extend-native */
// 1. This is a test, 2. String.prototype is not read only.

if (!String.prototype.repeat) {
  String.prototype.repeat = function() {
    // Dummy test polyfill.
  };
}
