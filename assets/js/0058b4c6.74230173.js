"use strict";(self.webpackChunkmetro_website=self.webpackChunkmetro_website||[]).push([[849],{86164:e=>{e.exports=JSON.parse('{"version":{"pluginId":"default","version":"current","label":"Next","banner":null,"badge":false,"noIndex":false,"className":"docs-version-current","isLast":true,"docsSidebars":{"docs":[{"type":"category","label":"Introduction","items":[{"type":"link","label":"Getting Started","href":"/docs/getting-started","docId":"getting-started","unlisted":false},{"type":"link","label":"Concepts","href":"/docs/concepts","docId":"concepts","unlisted":false}],"collapsed":true,"collapsible":true},{"type":"category","label":"API Reference","items":[{"type":"link","label":"Bundling API","href":"/docs/api","docId":"api","unlisted":false},{"type":"link","label":"Module API","href":"/docs/module-api","docId":"module-api","unlisted":false},{"type":"link","label":"Configuring Metro","href":"/docs/configuration","docId":"configuration","unlisted":false},{"type":"link","label":"Metro CLI Options","href":"/docs/cli","docId":"cli","unlisted":false}],"collapsed":true,"collapsible":true},{"type":"category","label":"Guides","items":[{"type":"link","label":"Package Exports Support (Experimental)","href":"/docs/package-exports","docId":"package-exports","unlisted":false},{"type":"link","label":"Troubleshooting","href":"/docs/troubleshooting","docId":"troubleshooting","unlisted":false}],"collapsed":true,"collapsible":true},{"type":"category","label":"Contributing","items":[{"type":"link","label":"Local Development Setup","href":"/docs/local-development","docId":"local-development","unlisted":false}],"collapsed":true,"collapsible":true},{"type":"category","label":"Deep Dives","items":[{"type":"link","label":"Bundle Formats","href":"/docs/bundling","docId":"bundling","unlisted":false},{"type":"link","label":"Caching","href":"/docs/caching","docId":"caching","unlisted":false},{"type":"link","label":"Module Resolution","href":"/docs/resolution","docId":"resolution","unlisted":false},{"type":"link","label":"Source Map Format","href":"/docs/source-map-format","docId":"source-map-format","unlisted":false}],"collapsed":true,"collapsible":true}]},"docs":{"api":{"id":"api","title":"Bundling API","description":"Quick Start","sidebar":"docs"},"bundling":{"id":"bundling","title":"Bundle Formats","description":"When bundling, each of the modules gets assigned a numeric id, meaning no dynamic requires are supported. Requires are changed by its numeric version, and modules are stored in different possible formats. Three different formats of bundling are supported:","sidebar":"docs"},"caching":{"id":"caching","title":"Caching","description":"Out of the box, Metro speeds up builds using a local cache of transformed modules. Thanks to this cache, Metro doesn\'t need to retransform modules unless the source code (or current configuration) has changed since the last time they were transformed.","sidebar":"docs"},"cli":{"id":"cli","title":"Metro CLI Options","description":"The metro command line runner has a number of useful options. You can run `metro","sidebar":"docs"},"concepts":{"id":"concepts","title":"Concepts","description":"Metro is a JavaScript bundler. It takes in an entry file and various options, and gives you back a single JavaScript file that includes all your code and its dependencies.","sidebar":"docs"},"configuration":{"id":"configuration","title":"Configuring Metro","description":"A Metro config can be created in these three ways (ordered by priority):","sidebar":"docs"},"getting-started":{"id":"getting-started","title":"Getting Started","description":"Install Metro using npm:","sidebar":"docs"},"local-development":{"id":"local-development","title":"Local Development Setup","description":"This page includes tips for developers working on Metro itself, including how to test your changes within other local projects.","sidebar":"docs"},"module-api":{"id":"module-api","title":"Module API","description":"Metro is designed to allow code written for Node (or for bundlers targeting the Web) to run mostly unmodified. The main APIs available to application code are listed below.","sidebar":"docs"},"package-exports":{"id":"package-exports","title":"Package Exports Support (Experimental)","description":"Background","sidebar":"docs"},"resolution":{"id":"resolution","title":"Module Resolution","description":"Module resolution is the process of translating module names to module paths at build time. For example, if your project contains the code:","sidebar":"docs"},"source-map-format":{"id":"source-map-format","title":"Source Map Format","description":"Metro produces standard source maps along with its JavaScript bundle output. In addition to the standard information, Metro encodes extra information in vendor-specific fields within the source map. This page serves as a specification for this encoding.","sidebar":"docs"},"troubleshooting":{"id":"troubleshooting","title":"Troubleshooting","description":"Uh oh, something went wrong? Use this guide to resolve issues with Metro.","sidebar":"docs"}}}}')}}]);