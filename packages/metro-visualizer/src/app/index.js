/**
 * Copyright (c) 2015-present, Facebook, Inc.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow strict-local
 * @format
 */

/* eslint-env browser */

'use strict';

const DashboardApp = require('./dashboard/DashboardApp');
const GraphApp = require('./graph/GraphApp');
const React = require('react');
const ReactDOM = require('react-dom');

const nullthrows = require('nullthrows');

const {HashRouter, Route} = require('react-router-dom');

ReactDOM.render(
  <HashRouter>
    <div>
      <Route exact path="/" component={DashboardApp} />
      <Route path="/graph/(.*)" component={GraphApp} />
    </div>
  </HashRouter>,
  nullthrows(document.getElementById('root')),
);
