/**
 * Copyright (c) 2018-present, Facebook, Inc.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @format
 * @flow
 */

'use strict';

const http = require('http');
const https = require('https');
const url = require('url');
const zlib = require('zlib');

import type {TransformedCode} from 'metro/src/JSTransformer/worker';

export type Options = {|
  endpoint: string,
  timeout?: number,
|};

const ZLIB_OPTIONS = {
  level: 9,
};

class HttpStore {
  _module: typeof http | typeof https;
  _timeout: number;

  _host: string;
  _port: number;
  _path: string;

  _getAgent: http$Agent;
  _setAgent: http$Agent;

  constructor(options: Options) {
    const uri = url.parse(options.endpoint);
    const module = uri.protocol === 'http:' ? http : https;

    const agentConfig = {
      keepAlive: true,
      keepAliveMsecs: options.timeout || 5000,
      maxSockets: 64,
      maxFreeSockets: 64,
    };

    if (!uri.hostname || !uri.pathname) {
      throw new TypeError('Invalid endpoint: ' + options.endpoint);
    }

    this._module = module;
    this._timeout = options.timeout || 5000;

    this._host = uri.hostname;
    this._path = uri.pathname;
    this._port = +uri.port;

    this._getAgent = new module.Agent(agentConfig);
    this._setAgent = new module.Agent(agentConfig);
  }

  get(key: Buffer): Promise<?TransformedCode> {
    return new Promise((resolve, reject) => {
      const options = {
        agent: this._getAgent,
        host: this._host,
        method: 'GET',
        path: this._path + '/' + key.toString('hex'),
        port: this._port,
        timeout: this._timeout,
      };

      const req = this._module.request(options, res => {
        let data = '';

        if (res.statusCode === 404) {
          resolve(null);
          return;
        } else if (res.statusCode !== 200) {
          reject(new Error('HTTP error: ' + res.statusCode));
          return;
        }

        const gunzipped = res.pipe(zlib.createGunzip());

        gunzipped.on('data', chunk => {
          data += chunk.toString();
        });

        gunzipped.on('error', err => {
          reject(err);
        });

        gunzipped.on('end', () => {
          try {
            resolve(JSON.parse(data));
          } catch (err) {
            reject(err);
          }
        });

        res.on('error', err => gunzipped.emit('error', err));
      });

      req.end();
    });
  }

  set(key: Buffer, value: TransformedCode): Promise<void> {
    return new Promise((resolve, reject) => {
      const gzip = zlib.createGzip(ZLIB_OPTIONS);

      const options = {
        agent: this._setAgent,
        host: this._host,
        method: 'PUT',
        path: this._path + '/' + key.toString('hex'),
        port: this._port,
        timeout: this._timeout,
      };

      const req = this._module.request(options, res => {
        res.on('error', err => {
          reject(err);
        });

        res.on('data', () => {
          // Do nothing. It is needed so node thinks we are consuming responses.
        });

        res.on('end', () => {
          resolve();
        });
      });

      gzip.pipe(req);
      gzip.end(JSON.stringify(value) || 'null');
    });
  }
}

module.exports = HttpStore;
