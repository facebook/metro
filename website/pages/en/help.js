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

class Help extends React.Component {
  render() {
    const supportLinks = [
      {
        content: (
          <translate>
            Find what you're looking for in our detailed documentation and
            guides.\n\n- Learn how to [get
            started](/metro/docs/en/getting-started.html) with Metro.\n-
            [Troubleshoot](/metro/docs/en/troubleshooting.html) problems with
            Metro.\n- Learn how to [configure
            Metro](/metro/docs/en/configuration.html).\n- Look at the full [API
            Reference](/metro/docs/en/api.html).
          </translate>
        ),
        title: <translate>Browse the docs</translate>,
      },
      {
        content: (
          <translate>
            Ask questions and find answers from other Metro users like you.\n\n-
            Join the
            [#metro](https://discordapp.com/channels/102860784329052160/103622435865104384)
            channel on [Reactiflux](http://www.reactiflux.com/), a Discord
            community.\n- Many members of the community use Stack Overflow. Read
            through the [existing
            questions](https://stackoverflow.com/questions/tagged/metrojs) tagged
            with **metrojs** or [ask your
            own](https://stackoverflow.com/questions/ask)!
          </translate>
        ),
        title: <translate>Join the community</translate>,
      },
      {
        content: (
          <translate>
            Find out what's new with Metro.\n\n- Follow
            [Metro](https://twitter.com/MetroBundler) on Twitter.\n- Subscribe to the
            [Metro blog](/metro/blog/).
          </translate>
        ),
        title: <translate>Stay up to date</translate>,
      },
    ];

    return (
      <div className="docMainWrapper wrapper">
        <Container className="mainContainer documentContainer postContainer">
          <div className="post">
            <header className="postHeader">
              <h2>
                <translate>Need help?</translate>
              </h2>
            </header>
            <p>
              <translate>
                Metro Bundler is worked on full-time by Facebook's JavaScript Foundation team.
                Team members are often around and available for questions.
              </translate>
            </p>
            <GridBlock contents={supportLinks} layout="threeColumn" />
          </div>
        </Container>
      </div>
    );
  }
}

Help.defaultProps = {
  language: 'en',
};

module.exports = Help;
