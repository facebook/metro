# Metro Visualizer

[![npm version](https://badge.fury.io/js/metro-visualizer.svg)](https://badge.fury.io/js/metro-visualizer)

📊 The interactive visualizer for Metro 🚇

A friendly and versatile tool to visualize the bundler's work.

The goal of this project is to provide a suite of analysis tools for bundle sizes and dependencies, while also making Metro more transparent and fun to use for entry level developers.

## Setup

1. Install the `metro-visualizer` package in your project. 
    
    ```
    yarn add metro-visualizer 
    ```
    ```
    npm install metro-visualizer --save 
    ```

2. Enable the visualizer in your [metro config](https://facebook.github.io/metro/docs/en/configuration#server-options). For a `metro.config.js` config file, add the following:

    ```js
    module.exports = {
        // ...
        server: {
            // ...
            enableVisualizer: true
        }
    };
    ```

3. Run `metro` and point your browser to http://localhost:8081/visualizer.

## Overview

### Dashboard for triggering builds 

You can easily toggle options for your builds. 

![build-options](/packages/metro-visualizer/screenshots/build-options.png)

The bundler's performance and activity is shown graphically. 

![build-options](/packages/metro-visualizer/screenshots/build-stats.png)

### Dependency graph 

Visualize a bundle's dependency graph. Search for modules to explore the graph incrementally. 

![build-options](/packages/metro-visualizer/screenshots/search.gif)

![build-options](/packages/metro-visualizer/screenshots/info.gif)

Search for all the paths between two modules to better understand your bundle. 

![build-options](/packages/metro-visualizer/screenshots/path-search.png)

Customize the way the graph is displayed. 

![build-options](/packages/metro-visualizer/screenshots/options.png)

## Development 

Follow the Metro guidelines for contributing to the project. There's a utility script to facilitate development. It spawns a Metro server with the visualizer enabled on this package itself. Run it with `yarn dev` or `npm run dev` from the `metro-visualizer` folder and trigger builds as it is shown in the screenshots above. 
