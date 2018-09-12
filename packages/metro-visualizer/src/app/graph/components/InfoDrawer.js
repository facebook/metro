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

const filesize = require('filesize');
const oneDarkPro = require('./themeOneDark');

const {css, injectGlobal} = require('emotion');

import {Drawer, Button, List, Modal, Collapse, Tag} from 'antd';
import type {NodeData} from 'metro-visualizer/src/types.flow';
import Highlight, {defaultProps} from 'prism-react-renderer';

type Props = {
  data?: ?NodeData,
};

type State = {
  visible: boolean,
};

class InfoDrawer extends React.Component<Props, State> {
  state = {visible: false};

  showDrawer = () => {
    this.setState({
      visible: true,
    });
  };

  onClose = () => {
    this.setState({
      visible: false,
    });
  };

  render() {
    return (
      <div>
        <Button
          className={infoDrawerButton}
          type="default"
          size="large"
          onClick={this.showDrawer}
          icon="info"
        />
        <Drawer
          title={this.props.data ? this.props.data.label : 'Module Info'}
          placement="left"
          mask={false}
          onClose={this.onClose}
          visible={this.state.visible}
          width={400}>
          {this.props.data ? (
            <NodeDataView data={this.props.data} />
          ) : (
            'Select a node to display information about it...'
          )}
        </Drawer>
      </div>
    );
  }
}

const codeModalStyle = {
  padding: 0,
  maxHeight: '70vh',
  overflowY: 'auto',
};

type ResourceModalProps = {
  title: React.Node,
  type: string,
  data: string,
};

type ResourceModalState = {
  visible: boolean,
};

class ResourceModal extends React.Component<
  ResourceModalProps,
  ResourceModalState,
> {
  state: ResourceModalState = {
    visible: false,
  };

  toggleVisible = () => {
    this.setState(s => ({visible: !s.visible}));
  };

  render() {
    const {title, type, data} = this.props;
    const {visible} = this.state;

    const supportedLanguages = {
      js: 'javascript',
      jsx: 'jsx',
      json: 'json',
      yml: 'yaml',
      yaml: 'yaml',
      css: 'css',
      less: 'less',
      sass: 'sass',
      scss: 'scss',
      stylus: 'stylus',
      re: 'reason',
      ts: 'typescript',
      ml: 'ocaml',
      html: 'html',
      xml: 'xml',
    };

    return (
      <React.Fragment>
        <Button icon="arrows-alt" onClick={this.toggleVisible} />

        <Modal
          title={title}
          footer={null}
          visible={visible}
          onCancel={this.toggleVisible}
          width={840}
          bodyStyle={codeModalStyle}>
          {Object.keys(supportedLanguages).includes(type) ? (
            <Highlight
              {...defaultProps}
              code={data}
              theme={oneDarkPro}
              language={supportedLanguages[type]}>
              {({className, style, tokens, getLineProps, getTokenProps}) => (
                <pre className={`${className} ${codeContainer}`} style={style}>
                  {tokens.map((line, i) => (
                    <div {...getLineProps({line, key: i})}>
                      {line.map((token, key) => (
                        <span {...getTokenProps({token, key})} />
                      ))}
                    </div>
                  ))}
                </pre>
              )}
            </Highlight>
          ) : (
            <pre className={codeContainer}>{data}</pre>
          )}
        </Modal>
      </React.Fragment>
    );
  }
}

const Item = ({
  title,
  children,
  vertical = false,
  actions,
}: {
  title: React.Node,
  children: React.Node,
  vertical?: boolean,
  actions?: React.Node,
}) => (
  <List.Item>
    <div
      className={`${itemWrapper} ${
        vertical ? itemWrapperVertical : itemWrapperHorizontal
      }`}>
      <div className={itemTitle}>{title}</div>
      <div
        className={`${itemContent} ${
          vertical ? itemContentVertical : itemContentHorizontal
        }`}>
        {children}
      </div>
      {actions != null && <div className={itemActions}>{actions}</div>}
    </div>
  </List.Item>
);

const NodeDataView = ({data}: {data: NodeData}) => {
  const sourceType = data.id.slice(data.id.lastIndexOf('.') + 1);
  const isImageType = /png|gif|jpe?g|svg|webp|bmp/.test(sourceType);

  const outputType = data.type.slice(0, data.type.indexOf('/'));

  return (
    <React.Fragment>
      <List>
        <Item title="Path" vertical>
          <ScrollablePath path={data.id} />
        </Item>

        <Item
          title="Source"
          actions={
            !isImageType && (
              <ResourceModal
                title="Source"
                type={sourceType}
                // By default, data.source is receive as a base64 string, since
                // it can be non-textual data, such as an image.
                data={atob(data.source)}
              />
            )
          }
          vertical={isImageType}>
          {isImageType && (
            <div className={sourceImageContainer}>
              <img src={`data:image/${sourceType};base64,${data.source}`} />
            </div>
          )}
        </Item>

        <Item
          title="Output"
          actions={
            <ResourceModal
              title="Output"
              type={outputType}
              data={data.output}
            />
          }>
          {filesize(data.size)}
        </Item>
      </List>
      <Collapse
        defaultActiveKey={[].concat(
          ...[
            data.deps.length > 0 ? ['deps'] : [],
            data.inverseDeps.length > 0 ? ['invdeps'] : [],
          ],
        )}>
        <Collapse.Panel
          key="deps"
          disabled={data.deps.length === 0}
          header={
            <div className={depHeader}>
              Dependencies
              <div className={depNumber}>
                <Tag color="blue">{data.deps.length}</Tag>
              </div>
            </div>
          }>
          <DepList deps={data.deps} />
        </Collapse.Panel>
        <Collapse.Panel
          key="invdeps"
          disabled={data.inverseDeps.length === 0}
          header={
            <div className={depHeader}>
              Inverse dependencies
              <div className={depNumber}>
                <Tag color="blue">{data.inverseDeps.length}</Tag>
              </div>
            </div>
          }>
          <DepList deps={data.inverseDeps} />
        </Collapse.Panel>
      </Collapse>
    </React.Fragment>
  );
};

const DepList = (props: {deps: Array<string>}) => (
  <List size="small" className={depList}>
    {props.deps.map(dep => (
      <Item key={dep} title={dep.slice(dep.lastIndexOf('/') + 1)} vertical>
        <ScrollablePath path={dep} />
      </Item>
    ))}
  </List>
);

type ScrollablePathProps = {
  path: string,
};

class ScrollablePath extends React.Component<ScrollablePathProps> {
  scrollRef = React.createRef();

  componentDidMount() {
    if (this.scrollRef.current != null) {
      // Default the path to be scrolled all the way to the right, as we expect
      // the last segments of the path to be the most relevant to the user.
      this.scrollRef.current.scrollLeft = this.scrollRef.current.scrollWidth;
    }
  }

  render() {
    return (
      <div className={pathWrapper} ref={this.scrollRef}>
        <div className={pathWrapperInner}>{this.props.path}</div>
      </div>
    );
  }
}

// Fixes an issue with flex and white-space: nowrap;
// Without this, there's no way of having a scrollable path inside of a
// List.Item.
injectGlobal`
  .ant-list-item-content {
    width: 100%;
  }
`;

const infoDrawerButton = css`
  position: absolute;
  top: 20px;
  left: 20px;
  font-size: 1.5em;
`;

const depHeader = css`
  display: flex;
`;

const depNumber = css`
  flex: 1;
  padding-right: 10px;
  text-align: right;
  font-family: Consolas, Menlo, Courier, monospace;
`;

const depList = css`
  max-height: 300px;
  overflow-y: auto;
`;

const itemWrapper = css`
  display: flex;
  width: 100%;
`;

const itemWrapperVertical = css`
  display: flex;
  flex-direction: column;
`;

const itemWrapperHorizontal = css`
  align-items: center;
`;

const itemTitle = css`
  font-weight: bold;
  padding-right: 10px;
`;

const itemContent = css`
  flex: 1;
  display: flex;
`;

const itemContentVertical = css`
  justify-content: flex-start;
`;

const itemContentHorizontal = css`
  justify-content: flex-end;
`;

const itemActions = css`
  padding-left: 10px;
`;

const pathWrapper = css`
  overflow-x: auto;
`;

const pathWrapperInner = css`
  font-family: Consolas, Menlo, Courier, monospace;
  white-space: nowrap;
`;

const codeContainer = css`
  /* Same as the chosen theme, vsDark */
  background-color: rgb(30, 30, 30);
  /* Define a default color for the case where we don't highlight the code */
  color: white;
  padding: 10px;
  margin: 0px;
`;

const sourceImageContainer = css`
  display: 'flex';
  justify-content: flex-start;
  max-height: 300px;
  overflow-y: auto;
`;

module.exports = InfoDrawer;
