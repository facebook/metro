/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @format
 * @flow
 */

'use strict';

// $FlowIssue[bigint-unsupported]
// $FlowFixMe[signature-verification-failure]
var a = 2n;
// $FlowIssue[bigint-unsupported]
// $FlowFixMe[signature-verification-failure]
var b = 3n;
// $FlowFixMe[unsafe-addition]
module.exports = a ** b;
