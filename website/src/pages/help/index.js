/**
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @format
 */

"use strict";

import React from "react";
import Layout from "@theme/Layout";
import ReactMarkdown from "react-markdown";

const supportLinks = [
  {
    content: `Find what you're looking for in our detailed documentation and
        guides.\n\n- Learn how to [get
        started](/metro/docs/en/getting-started.html) with Metro.\n- [Troubleshoot](/metro/docs/en/troubleshooting.html) problems with
        Metro.\n- Learn how to [configure
        Metro](/metro/docs/en/configuration.html).\n- Look at the full [API
        Reference](/metro/docs/en/api.html).`,
    title: "Browse the docs"
  },
  {
    content: `Ask questions and find answers from other Metro users like you.\n\n- Join the
        [#metro](https://discordapp.com/channels/102860784329052160/103622435865104384)
        channel on [Reactiflux](http://www.reactiflux.com/), a Discord
        community.\n- Many members of the community use Stack Overflow. Read
        through the [existing
        questions](https://stackoverflow.com/questions/tagged/metrojs)
        tagged with **metrojs** or [ask your
        own](https://stackoverflow.com/questions/ask)!`,
    title: "Join the community"
  },
  {
    content: `Find out what's new with Metro.\n\n- Follow
        [Metro](https://twitter.com/MetroBundler) on Twitter.\n- Subscribe
        to the [Metro blog](/metro/blog/).`,
    title: "Stay up to date"
  }
];

const Help = () => {
  return (
    <Layout title="Help">
      <div className="container margin-vert--lg">
        <header className="postHeader">
          <h2>Need help?</h2>
        </header>
        <p>
          Metro is worked on by Facebook's React Native team. Team members are
          often around and available for questions.
        </p>

        <div class="row">
          {supportLinks.map(({ content, title }) => {
            return (
              <div className="col col--4 margin-vert--md">
                <h2>{title}</h2>
                <ReactMarkdown source={content} />
              </div>
            );
          })}
        </div>
      </div>
    </Layout>
  );
};

export default Help;
