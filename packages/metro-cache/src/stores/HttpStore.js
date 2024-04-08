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

import type {Agent as HttpAgent} from 'http';
import type {Agent as HttpsAgent} from 'https';

const HttpError = require('./HttpError');
const NetworkError = require('./NetworkError');
const http = require('http');
const https = require('https');
const url = require('url');
const zlib = require('zlib');

export type Options =
  | EndpointOptions // Uses the same options for both reads and writes
  | {getOptions: EndpointOptions, setOptions: EndpointOptions}; // Uses different options for reads and writes

type EndpointOptions = {
  endpoint: string,
  family?: 4 | 6,
  timeout?: number,
  key?: string | $ReadOnlyArray<string> | Buffer | $ReadOnlyArray<Buffer>,
  cert?: string | $ReadOnlyArray<string> | Buffer | $ReadOnlyArray<Buffer>,
  ca?: string | $ReadOnlyArray<string> | Buffer | $ReadOnlyArray<Buffer>,
  params?: URLSearchParams,
  headers?: {[string]: string},
  additionalSuccessStatuses?: $ReadOnlyArray<number>,
  /**
   * Whether to include additional debug information in error messages.
   */
  debug?: boolean,
};

type Endpoint = {
  module: typeof http | typeof https,
  host: string,
  path: string,
  port: number,
  agent: HttpAgent | HttpsAgent,
  params: URLSearchParams,
  headers?: {[string]: string},
  timeout: number,
  additionalSuccessStatuses: $ReadOnlySet<number>,
  debug: boolean,
};

const ZLIB_OPTIONS = {
  level: 9,
};

const NULL_BYTE = 0x00;
const NULL_BYTE_BUFFER = Buffer.from([NULL_BYTE]);

class HttpStore<T> {
  static HttpError: typeof HttpError = HttpError;
  static NetworkError: typeof NetworkError = NetworkError;

  _getEndpoint: Endpoint;
  _setEndpoint: Endpoint;

  constructor(options: Options) {
    this._getEndpoint = this.createEndpointConfig(
      options.getOptions != null ? options.getOptions : options,
    );
    this._setEndpoint = this.createEndpointConfig(
      options.setOptions != null ? options.setOptions : options,
    );
  }

  createEndpointConfig(options: EndpointOptions): Endpoint {
    const agentConfig: http$agentOptions = {
      family: options.family,
      keepAlive: true,
      keepAliveMsecs: options.timeout || 5000,
      maxSockets: 64,
      maxFreeSockets: 64,
    };

    if (options.key != null) {
      // $FlowFixMe `key` is missing in the Flow definition
      agentConfig.key = options.key;
    }

    if (options.cert != null) {
      // $FlowFixMe `cert` is missing in the Flow definition
      agentConfig.cert = options.cert;
    }

    if (options.ca != null) {
      // $FlowFixMe `ca` is missing in the Flow definition
      agentConfig.ca = options.ca;
    }

    const uri = url.parse(options.endpoint);
    const module = uri.protocol === 'http:' ? http : https;

    if (!uri.hostname || !uri.pathname) {
      throw new TypeError('Invalid endpoint: ' + options.endpoint);
    }

    return {
      headers: options.headers,
      host: uri.hostname,
      path: uri.pathname,
      port: +uri.port,
      agent: new module.Agent(agentConfig),
      params: new URLSearchParams(options.params),
      timeout: options.timeout || 5000,
      module: uri.protocol === 'http:' ? http : https,
      additionalSuccessStatuses: new Set(
        options.additionalSuccessStatuses ?? [],
      ),
      debug: options.debug ?? false,
    };
  }

  get(key: Buffer): Promise<?T> {
    return new Promise((resolve, reject) => {
      let searchParamsString = this._getEndpoint.params.toString();
      if (searchParamsString != '') {
        searchParamsString = '?' + searchParamsString;
      }
      const options = {
        agent: this._getEndpoint.agent,
        headers: this._getEndpoint.headers,
        host: this._getEndpoint.host,
        method: 'GET',
        path: `${this._getEndpoint.path}/${key.toString(
          'hex',
        )}${searchParamsString}`,
        port: this._getEndpoint.port,
        timeout: this._getEndpoint.timeout,
      };

      /* $FlowFixMe(>=0.101.0 site=react_native_fb) This comment suppresses an
       * error found when Flow v0.101 was deployed. To see the error, delete
       * this comment and run Flow. */
      const req = this._getEndpoint.module.request(options, res => {
        const code = res.statusCode;
        const data = [];

        if (code === 404) {
          res.resume();
          resolve(null);

          return;
        } else if (
          code !== 200 &&
          !this._getEndpoint.additionalSuccessStatuses.has(code)
        ) {
          if (this._getEndpoint.debug) {
            res.on('data', chunk => {
              data.push(chunk);
            });
            res.on('error', err => {
              reject(
                new HttpError(
                  'Encountered network error (' +
                    err.message +
                    ') while handling HTTP error: ' +
                    code +
                    ' ' +
                    http.STATUS_CODES[code],
                  code,
                ),
              );
            });
            res.on('end', () => {
              const buffer = Buffer.concat(data);
              reject(
                new HttpError(
                  'HTTP error: ' +
                    code +
                    ' ' +
                    http.STATUS_CODES[code] +
                    '\n\n' +
                    buffer.toString(),
                  code,
                ),
              );
            });
          } else {
            res.resume();
            reject(
              new HttpError(
                'HTTP error: ' + code + ' ' + http.STATUS_CODES[code],
                code,
              ),
            );
          }

          return;
        }

        const gunzipped = res.pipe(zlib.createGunzip());

        gunzipped.on('data', chunk => {
          data.push(chunk);
        });

        gunzipped.on('error', err => {
          reject(err);
        });

        gunzipped.on('end', () => {
          try {
            const buffer = Buffer.concat(data);

            if (buffer.length > 0 && buffer[0] === NULL_BYTE) {
              resolve((buffer.slice(1): any));
            } else {
              resolve(JSON.parse(buffer.toString('utf8')));
            }
          } catch (err) {
            reject(err);
          }
        });

        res.on('error', err => gunzipped.emit('error', err));
      });

      req.on('error', err => {
        reject(new NetworkError(err.message, err.code));
      });

      req.on('timeout', () => {
        req.destroy(new Error('Request timed out'));
      });

      req.end();
    });
  }

  set(key: Buffer, value: T): Promise<void> {
    return new Promise((resolve, reject) => {
      const gzip = zlib.createGzip(ZLIB_OPTIONS);

      let searchParamsString = this._setEndpoint.params.toString();
      if (searchParamsString != '') {
        searchParamsString = '?' + searchParamsString;
      }

      const options = {
        agent: this._setEndpoint.agent,
        headers: this._setEndpoint.headers,
        host: this._setEndpoint.host,
        method: 'PUT',
        path: `${this._setEndpoint.path}/${key.toString(
          'hex',
        )}${searchParamsString}`,
        port: this._setEndpoint.port,
        timeout: this._setEndpoint.timeout,
      };

      /* $FlowFixMe(>=0.101.0 site=react_native_fb) This comment suppresses an
       * error found when Flow v0.101 was deployed. To see the error, delete
       * this comment and run Flow. */
      const req = this._setEndpoint.module.request(options, res => {
        const code = res.statusCode;

        if (
          (code < 200 || code > 299) &&
          !this._setEndpoint.additionalSuccessStatuses.has(code)
        ) {
          if (this._setEndpoint.debug) {
            const data = [];
            res.on('data', chunk => {
              data.push(chunk);
            });
            res.on('error', err => {
              reject(
                new HttpError(
                  'Encountered network error (' +
                    err.message +
                    ') while handling HTTP error: ' +
                    code +
                    ' ' +
                    http.STATUS_CODES[code],
                  code,
                ),
              );
            });
            res.on('end', () => {
              const buffer = Buffer.concat(data);
              reject(
                new HttpError(
                  'HTTP error: ' +
                    code +
                    ' ' +
                    http.STATUS_CODES[code] +
                    '\n\n' +
                    buffer.toString(),
                  code,
                ),
              );
            });
          } else {
            res.resume();
            reject(
              new HttpError(
                'HTTP error: ' + code + ' ' + http.STATUS_CODES[code],
                code,
              ),
            );
          }

          return;
        }

        res.on('error', err => {
          reject(err);
        });

        res.on('end', () => {
          resolve();
        });

        // Consume all the data from the response without processing it.
        res.resume();
      });

      req.on('timeout', () => {
        req.destroy(new Error('Request timed out'));
      });

      gzip.pipe(req);

      if (value instanceof Buffer) {
        gzip.write(NULL_BYTE_BUFFER);
        gzip.end(value);
      } else {
        gzip.end(JSON.stringify(value) || 'null');
      }
    });
  }

  clear() {
    // Not implemented.
  }
}

module.exports = HttpStore;
