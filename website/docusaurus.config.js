/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @format
 */

'use strict';

const siteConfig = {
  presets: [
    [
      '@docusaurus/preset-classic',
      {
        docs: {
          path: '../docs',
          editUrl: 'https://github.com/facebook/metro/edit/main/docs',
          sidebarPath: require.resolve('./sidebars.json'),
          showLastUpdateTime: true,
        },
        theme: {
          customCss: require.resolve('./src/css/custom.css'),
        },
      },
    ],
  ],
  title: 'Metro',
  tagline: '\ud83d\ude87 The JavaScript bundler for React Native',
  organizationName: 'facebook',
  projectName: 'metro',
  url: 'https://facebook.github.io',
  baseUrl: '/metro/',
  favicon: 'img/favicon.png',
  themeConfig: {
    navbar: {
      title: 'Metro',
      logo: {
        alt: 'Metro Logo',
        src: 'img/metro.svg',
      },
      items: [
        {label: 'Docs', to: 'docs/getting-started'},
        {label: 'API', to: 'docs/api'},
        {label: 'Help', to: 'help'},
        {label: 'Blog', to: 'blog'},
        {
          label: 'Twitter',
          href: 'https://twitter.com/MetroBundler',
          position: 'right',
        },
        {
          label: 'GitHub',
          href: 'https://github.com/facebook/metro',
          position: 'right',
        },
      ],
    },
    footer: {
      style: 'dark',
      links: [
        {
          title: 'Docs',
          items: [
            {label: 'Quick Start', to: 'docs/getting-started'},
            {label: 'API Reference', to: 'docs/api'},
          ],
        },
        {
          title: 'Community',
          items: [
            {
              label: 'Stack Overflow',
              href: 'https://stackoverflow.com/questions/tagged/metrojs',
            },
            {label: 'Twitter', href: 'https://twitter.com/MetroBundler'},
          ],
        },
        {
          title: 'More',
          items: [
            {label: 'Blog', to: 'blog'},
            {label: 'Github', href: 'https://github.com/facebook/metro'},
          ],
        },
      ],
      logo: {
        alt: 'Facebook Open Source Logo',
        src: 'img/oss_logo.png',
        href: 'https://opensource.facebook.com/',
      },
      copyright: `Copyright © ${new Date().getFullYear()} Facebook Inc. Built with Docusaurus.`,
    },
    image: 'img/opengraph.png',
    algolia: {
      apiKey: 'd51e7fbd21ccab3db4c83f0f736f6a3a',
      appId: 'T38HJZTD87',
      indexName: 'metro',
    },
    gtag: {
      trackingID: 'UA-44373548-17',
    },
  },
  scripts: ['https://buttons.github.io/buttons.js'],
};

module.exports = siteConfig;
