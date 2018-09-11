/**
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

'use strict';

const CompLibrary = require('../../core/CompLibrary.js');
const React = require('react');
const Container = CompLibrary.Container;
const GridBlock = CompLibrary.GridBlock;

const translate = require('../../server/translate.js').translate;
const translation = require('../../server/translation.js');

const siteConfig = require(process.cwd() + '/siteConfig.js');

const githubButton = (
  <a
    className="github-button"
    href="https://github.com/facebook/metro"
    data-icon="octicon-star"
    data-count-href="/facebook/metro/stargazers"
    data-count-api="/repos/facebook/metro#stargazers_count"
    data-count-aria-label="# stargazers on GitHub"
    aria-label="Star facebook/metro on GitHub"
  >
    Star
  </a>
);

class Button extends React.Component {
  render() {
    return (
      <div className="pluginWrapper buttonWrapper">
        <a className="button" href={this.props.href} target={this.props.target}>
          {this.props.children}
        </a>
      </div>
    );
  }
}

Button.defaultProps = {
  target: '_self',
};

class HomeSplash extends React.Component {
  render() {
    return (
      <div className="homeContainer">
        <div className="homeSplashFade">
          <div className="wrapper homeWrapper">
            <div className="projectLogo">
              <img
                src={siteConfig.baseUrl + 'img/metro.svg'}
                alt="Metro"
              />
            </div>
            <div className="inner">
              <h2 className="projectTitle">
                {siteConfig.title}
                <small>
                  {
                    translation[this.props.language]['localized-strings']
                      .tagline
                  }
                </small>
              </h2>
              <div className="section promoSection">
                <div className="promoRow">
                  <div className="pluginRowBlock">
                    <Button
                      href={
                        siteConfig.baseUrl +
                        'docs/' +
                        this.props.language +
                        '/getting-started.html'
                      }
                    >
                      <translate>Get Started</translate>
                    </Button>
                    <Button
                      href={
                        siteConfig.baseUrl +
                        'docs/' +
                        this.props.language +
                        '/api.html'
                      }
                    >
                      <translate>Learn More</translate>
                    </Button>
                  </div>
                </div>
              </div>
              <div className="githubButton" style={{minHeight: '20px'}}>
                {githubButton}
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }
}

class Index extends React.Component {
  render() {
    return (
      <div>
        <HomeSplash language={this.props.language} />
        <div className="mainContainer">
          <Container padding={['bottom', 'top']}>
            <GridBlock
              align="center"
              contents={[
                {
                  content: (
                    <translate>
                      Metro aims for sub-second reload cycles, fast startup and quick bundling speeds.
                    </translate>
                  ),
                  image: '/metro/img/content/high-speed-train.png',
                  imageAlign: 'top',
                  title: <translate>Fast</translate>,
                },
                {
                  content: (
                    <translate>
                      Works with thousands of modules in a single application.
                    </translate>
                  ),
                  image: '/metro/img/content/scales.png',
                  imageAlign: 'top',
                  title: <translate>Scalable</translate>,
                },
                {
                  content: (
                    <translate>
                      Supports every React Native project out of the box.
                    </translate>
                  ),
                  image: '/metro/img/content/atom.png',
                  imageAlign: 'top',
                  title: <translate>Integrated</translate>,
                },
              ]}
              layout="fourColumn"
            />
          </Container>
        </div>
      </div>
    );
  }
}

module.exports = Index;
