'use strict';

const path = require('path');

require('metro-babel-register')([path.join(__dirname, 'packages/')]);
module.exports = require('metro/src/DeltaBundler/Worker');
