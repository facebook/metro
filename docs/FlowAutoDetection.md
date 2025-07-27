# Flow Auto-Detection in Metro

## Overview

Metro can automatically detect Flow files and use the `hermes-parser` for parsing them, which provides full support for modern Flow syntax including component syntax introduced in Flow v0.233.0.

## Configuration

To enable Flow auto-detection, add the following to your `metro.config.js`:

```javascript
module.exports = {
  transformer: {
    unstable_enableFlowAutoDetection: true,
  },
};
```

## How It Works

When enabled, Metro will use `hermes-parser` instead of the default Babel parser for files that:

1. Contain `@flow` or `@noflow` pragma
2. Have `.flow.js` extension
3. Contain Flow component syntax (e.g., `component(...)`)

## Requirements

- `hermes-parser` must be installed in your project
- Metro will warn if Flow syntax is detected but `hermes-parser` is not available

## Installation

```bash
npm install --save-dev hermes-parser
# or
yarn add --dev hermes-parser
```

## Benefits

- Full support for Flow v0.233.0+ syntax
- No need for workarounds or syntax transformations
- Better error messages for Flow syntax errors
- Maintained by the Flow team

## Fallback Behavior

If `hermes-parser` fails to parse a file, Metro will automatically fall back to the Babel parser with a warning.

## Explicit Configuration

You can still explicitly enable/disable `hermes-parser` for all files:

```javascript
module.exports = {
  transformer: {
    hermesParser: true, // Use hermes-parser for all files
  },
};
```

This explicit setting takes precedence over auto-detection.