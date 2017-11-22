// Copyright 2004-present Facebook. All Rights Reserved.

'use strict';

const React = require('react');

const githubButton = (
  <a
    className="github-button"
    href="https://github.com/facebook/metro-bundler"
    data-icon="octicon-star"
    data-count-href="/facebook/metro-bundler/stargazers"
    data-count-api="/repos/facebook/metro-bundler#stargazers_count"
    data-count-aria-label="# stargazers on GitHub"
    aria-label="Star this project on GitHub"
  >
    Star
  </a>
);

class Footer extends React.Component {
  render() {
    const currentYear = new Date().getFullYear();
    return (
      <footer className="nav-footer" id="footer">
        <section className="sitemap">
          <a href={this.props.config.baseUrl} className="nav-home">
            <img
              src={this.props.config.baseUrl + this.props.config.footerIcon}
              alt={this.props.config.title}
              width="66"
              height="58"
            />
          </a>
          <div>
            <h5>Docs</h5>
            <a
              href={
                this.props.config.baseUrl +
                'docs/' +
                this.props.language +
                '/getting-started.html'
              }
            >
              Getting Started
            </a>
            <a
              href={
                this.props.config.baseUrl +
                'docs/' +
                this.props.language +
                '/api.html'
              }
            >
              API Reference
            </a>
          </div>
          <div>
            <h5>Community</h5>
            <a
              href="https://stackoverflow.com/questions/tagged/metrojs"
              target="_blank"
            >
              Stack Overflow
            </a>
            <a href="https://twitter.com/MetroBundler" target="_blank">
              Twitter
            </a>
          </div>
          <div>
            <h5>More</h5>
            <a href={this.props.config.baseUrl + 'blog'}>Blog</a>
            <a href="https://github.com/facebook/metro-bundler">GitHub</a>
            {githubButton}
          </div>
        </section>

        <a
          href="https://code.facebook.com/projects/"
          target="_blank"
          className="fbOpenSource"
        >
          <img
            src={this.props.config.baseUrl + 'img/oss_logo.png'}
            alt="Facebook Open Source"
            width="170"
            height="45"
          />
        </a>
        <section className="copyright">
          Copyright &copy; {currentYear} Facebook Inc.
        </section>
      </footer>
    );
  }
}

module.exports = Footer;
