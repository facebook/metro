'use strict';

const parser = require('@babel/parser');

module.exports.transform = function ({src}) {
  return {
    ast: parser.parse(src, {
      plugins: ['flow', 'dynamicImport'],
      sourceType: 'unambiguous',
    }),
    metadata: {},
  };
};

module.exports.getCacheKey = function () {
  return 'passthrough-transformer';
};
