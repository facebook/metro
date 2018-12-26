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

const React = require('react');

import {Cascader} from 'antd';

type Props = {
  ...React.ElementConfig<typeof Cascader>,
  value?: [],
  defaultValue?: void,
  onChange?: ({}) => void,
};

/**
 * A constrained version of Cascader that builds up a key-value object instead
 * of a list of strings as its output. This is done by serializing the option
 * values as URL query strings and delegating the rest of the functionality
 *
 * See also: https://ant.design/components/cascader/
 *
 * NOTE: This component is a minimal implementation for a specific use-case. It
 * can be extended, but currently only explicitly supports the `options` and
 * `onChange` props, and only supports setting `value` to the empty array.
 */
class URLParamsCascader extends React.Component<Props> {
  _mapOptions(options) {
    if (!options) {
      return undefined;
    }
    return options.map(option => ({
      ...option,
      value: new URLSearchParams(option.value || {}).toString(),
      children: this._mapOptions(option.children),
    }));
  }

  _handleChange = selection => {
    if (!this.props.onChange) {
      return;
    }
    const params = {};
    for (const [key, value] of new URLSearchParams(selection.join('&'))) {
      params[key] = value;
    }
    this.props.onChange(params);
  };

  render() {
    const {options, defaultValue: _defaultValue, ...cascaderProps} = this.props;
    return (
      <Cascader
        {...cascaderProps}
        options={this._mapOptions(options)}
        onChange={this._handleChange}
      />
    );
  }
}

module.exports = URLParamsCascader;
