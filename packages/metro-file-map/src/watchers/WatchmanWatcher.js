/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @format
 */

import common from './common';
import RecrawlWarning from './RecrawlWarning';
import assert from 'assert';
import {EventEmitter} from 'events';
import watchman from 'fb-watchman';
import * as fs from 'graceful-fs';
import path from 'path';

const CHANGE_EVENT = common.CHANGE_EVENT;
const DELETE_EVENT = common.DELETE_EVENT;
const ADD_EVENT = common.ADD_EVENT;
const ALL_EVENT = common.ALL_EVENT;
const SUB_NAME = 'sane-sub';

/**
 * Watches `dir`.
 *
 * @class PollWatcher
 * @param String dir
 * @param {Object} opts
 * @public
 */

export default function WatchmanWatcher(dir, opts) {
  common.assignOptions(this, opts);
  this.root = path.resolve(dir);
  this.init();
}

// eslint-disable-next-line no-proto
WatchmanWatcher.prototype.__proto__ = EventEmitter.prototype;

/**
 * Run the watchman `watch` command on the root and subscribe to changes.
 *
 * @private
 */

WatchmanWatcher.prototype.init = function () {
  if (this.client) {
    this.client.removeAllListeners();
  }

  const self = this;
  this.client = new watchman.Client();
  this.client.on('error', error => {
    self.emit('error', error);
  });
  this.client.on('subscription', this.handleChangeEvent.bind(this));
  this.client.on('end', () => {
    console.warn('[sane] Warning: Lost connection to watchman, reconnecting..');
    self.init();
  });

  this.watchProjectInfo = null;

  function getWatchRoot() {
    return self.watchProjectInfo ? self.watchProjectInfo.root : self.root;
  }

  function onCapability(error, resp) {
    if (handleError(self, error)) {
      // The Watchman watcher is unusable on this system, we cannot continue
      return;
    }

    handleWarning(resp);

    self.capabilities = resp.capabilities;

    if (self.capabilities.relative_root) {
      self.client.command(['watch-project', getWatchRoot()], onWatchProject);
    } else {
      self.client.command(['watch', getWatchRoot()], onWatch);
    }
  }

  function onWatchProject(error, resp) {
    if (handleError(self, error)) {
      return;
    }

    handleWarning(resp);

    self.watchProjectInfo = {
      relativePath: resp.relative_path ? resp.relative_path : '',
      root: resp.watch,
    };

    self.client.command(['clock', getWatchRoot()], onClock);
  }

  function onWatch(error, resp) {
    if (handleError(self, error)) {
      return;
    }

    handleWarning(resp);

    self.client.command(['clock', getWatchRoot()], onClock);
  }

  function onClock(error, resp) {
    if (handleError(self, error)) {
      return;
    }

    handleWarning(resp);

    const options = {
      fields: ['name', 'exists', 'new'],
      since: resp.clock,
    };

    // If the server has the wildmatch capability available it supports
    // the recursive **/*.foo style match and we can offload our globs
    // to the watchman server.  This saves both on data size to be
    // communicated back to us and compute for evaluating the globs
    // in our node process.
    if (self.capabilities.wildmatch) {
      if (self.globs.length === 0) {
        if (!self.dot) {
          // Make sure we honor the dot option if even we're not using globs.
          options.expression = [
            'match',
            '**',
            'wholename',
            {
              includedotfiles: false,
            },
          ];
        }
      } else {
        options.expression = ['anyof'];
        for (const i in self.globs) {
          options.expression.push([
            'match',
            self.globs[i],
            'wholename',
            {
              includedotfiles: self.dot,
            },
          ]);
        }
      }
    }

    if (self.capabilities.relative_root) {
      options.relative_root = self.watchProjectInfo.relativePath;
    }

    self.client.command(
      ['subscribe', getWatchRoot(), SUB_NAME, options],
      onSubscribe,
    );
  }

  function onSubscribe(error, resp) {
    if (handleError(self, error)) {
      return;
    }

    handleWarning(resp);

    self.emit('ready');
  }

  self.client.capabilityCheck(
    {
      optional: ['wildmatch', 'relative_root'],
    },
    onCapability,
  );
};

/**
 * Handles a change event coming from the subscription.
 *
 * @param {Object} resp
 * @private
 */

WatchmanWatcher.prototype.handleChangeEvent = function (resp) {
  assert.equal(resp.subscription, SUB_NAME, 'Invalid subscription event.');
  if (resp.is_fresh_instance) {
    this.emit('fresh_instance');
  }
  if (resp.is_fresh_instance) {
    this.emit('fresh_instance');
  }
  if (Array.isArray(resp.files)) {
    resp.files.forEach(this.handleFileChange, this);
  }
};

/**
 * Handles a single change event record.
 *
 * @param {Object} changeDescriptor
 * @private
 */

WatchmanWatcher.prototype.handleFileChange = function (changeDescriptor) {
  const self = this;
  let absPath;
  let relativePath;

  if (this.capabilities.relative_root) {
    relativePath = changeDescriptor.name;
    absPath = path.join(
      this.watchProjectInfo.root,
      this.watchProjectInfo.relativePath,
      relativePath,
    );
  } else {
    absPath = path.join(this.root, changeDescriptor.name);
    relativePath = changeDescriptor.name;
  }

  if (
    !(self.capabilities.wildmatch && !this.hasIgnore) &&
    !common.isFileIncluded(this.globs, this.dot, this.doIgnore, relativePath)
  ) {
    return;
  }

  if (!changeDescriptor.exists) {
    self.emitEvent(DELETE_EVENT, relativePath, self.root);
  } else {
    fs.lstat(absPath, (error, stat) => {
      // Files can be deleted between the event and the lstat call
      // the most reliable thing to do here is to ignore the event.
      if (error && error.code === 'ENOENT') {
        return;
      }

      if (handleError(self, error)) {
        return;
      }

      const eventType = changeDescriptor.new ? ADD_EVENT : CHANGE_EVENT;

      // Change event on dirs are mostly useless.
      if (!(eventType === CHANGE_EVENT && stat.isDirectory())) {
        self.emitEvent(eventType, relativePath, self.root, stat);
      }
    });
  }
};

/**
 * Dispatches the event.
 *
 * @param {string} eventType
 * @param {string} filepath
 * @param {string} root
 * @param {fs.Stat} stat
 * @private
 */

WatchmanWatcher.prototype.emitEvent = function (
  eventType,
  filepath,
  root,
  stat,
) {
  this.emit(eventType, filepath, root, stat);
  this.emit(ALL_EVENT, eventType, filepath, root, stat);
};

/**
 * Closes the watcher.
 *
 */

WatchmanWatcher.prototype.close = function () {
  this.client.removeAllListeners();
  this.client.end();
  return Promise.resolve();
};

/**
 * Handles an error and returns true if exists.
 *
 * @param {WatchmanWatcher} self
 * @param {Error} error
 * @private
 */

function handleError(self, error) {
  if (error != null) {
    self.emit('error', error);
    return true;
  } else {
    return false;
  }
}

/**
 * Handles a warning in the watchman resp object.
 *
 * @param {object} resp
 * @private
 */

function handleWarning(resp) {
  if ('warning' in resp) {
    if (RecrawlWarning.isRecrawlWarningDupe(resp.warning)) {
      return true;
    }
    console.warn(resp.warning);
    return true;
  } else {
    return false;
  }
}
