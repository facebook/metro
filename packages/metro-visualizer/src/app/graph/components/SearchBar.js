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

const FuzzySearch = require('fuzzy-search');
const React = require('react');

const {css} = require('emotion');

import {Icon, Input, AutoComplete} from 'antd';
import type {ModuleList} from 'metro-visualizer/src/types.flow';

type Props = {
  data: ModuleList,
  onSelection: string => void,
};
type State = {
  results: ModuleList,
  query: string,
};

class SearchBar extends React.Component<Props, State> {
  searcher: FuzzySearch;
  state = {results: [], query: ''};

  constructor(props: Props) {
    super(props);
    this.searcher = new FuzzySearch(props.data, ['name'], {sort: true});
  }

  handleSearch = (value: string) => {
    this.setState({
      results: this.searcher.search(value),
      query: value,
    });
  };

  handleSubmit = (value: string) => {
    this.setState({query: value.substring(value.lastIndexOf('/') + 1)});
    this.props.onSelection(value);
  };

  render() {
    return (
      <AutoComplete
        size="large"
        value={this.state.query}
        className={searchBar}
        onSearch={this.handleSearch}
        onSelect={this.handleSubmit}
        placeholder="Search for modules"
        dataSource={this.state.results.slice(0, 10).map(module => (
          <AutoComplete.Option key={module.filePath} value={module.filePath}>
            {module.name}
            <p style={{fontSize: '7pt', marginBottom: '0px'}}>
              {module.filePath}
            </p>
          </AutoComplete.Option>
        ))}>
        <Input
          suffix={<Icon type="search" className="certain-category-icon" />}
        />
      </AutoComplete>
    );
  }
}

const searchBar = css`
  margin: 0px 8px 2px 8px;
  width: 100%;
  font-size: 11pt;
`;

module.exports = SearchBar;
