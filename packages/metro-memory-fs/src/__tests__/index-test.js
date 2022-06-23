/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @emails oncall+js_foundation
 * @flow
 * @format
 */

'use strict';

/* eslint-disable no-bitwise */

jest.useRealTimers();

const MemoryFs = require('../index');
const path = require('path');

let fs;

describe('posix support', () => {
  beforeEach(() => {
    fs = new MemoryFs({cwd: () => '/current/working/dir'});
  });

  describe('accessSync', () => {
    it('accesses owned file', () => {
      fs.writeFileSync('/foo.txt', 'test');
      fs.accessSync('/foo.txt');
    });

    it('check owned file can be read and written to', () => {
      fs.writeFileSync('/foo.txt', 'test');
      fs.accessSync('/foo.txt', fs.constants.R_OK | fs.constants.W_OK);
    });

    it('check owned file cannot be read', () => {
      fs.writeFileSync('/foo.txt', 'test', {mode: 0o000});
      expectFsError('EPERM', () =>
        fs.accessSync('/foo.txt', fs.constants.R_OK),
      );
    });

    it('check owned file cannot be written to', () => {
      fs.writeFileSync('/foo.txt', 'test', {mode: 0o000});
      expectFsError('EPERM', () =>
        fs.accessSync('/foo.txt', fs.constants.W_OK),
      );
    });
  });

  it('can write then read a file', () => {
    fs.writeFileSync('/foo.txt', 'test');
    expect(fs.readFileSync('/foo.txt', 'utf8')).toEqual('test');
  });

  it('can write then read a file with options object', () => {
    fs.writeFileSync('/foo.txt', 'test');
    expect(fs.readFileSync('/foo.txt', {encoding: 'utf8'})).toEqual('test');
  });

  it('works without binding functions', () => {
    const {writeFileSync, readFileSync} = fs;
    writeFileSync('/foo.txt', 'test');
    expect(readFileSync('/foo.txt', 'utf8')).toEqual('test');
  });

  it('can write then read a file (async)', done => {
    fs.writeFile('/foo.txt', 'test', wrError => {
      if (wrError) {
        // $FlowFixMe - Upgrading the Jest definition revealed errors
        done(wrError);
        return;
      }
      fs.readFile('/foo.txt', 'utf8', (rdError, str) => {
        if (rdError) {
          // $FlowFixMe - Upgrading the Jest definition revealed errors
          done(rdError);
          return;
        }
        expect(str).toEqual('test');
        done();
      });
    });
  });

  it('can write then read a file as buffer', () => {
    fs.writeFileSync('/foo.txt', Buffer.from([1, 2, 3, 4]));
    expect(fs.readFileSync('/foo.txt')).toEqual(Buffer.from([1, 2, 3, 4]));
  });

  it('can write a file with a relative path', () => {
    fs.mkdirSync('/current');
    fs.mkdirSync('/current/working');
    fs.mkdirSync('/current/working/dir');
    fs.writeFileSync('foo.txt', 'test');
    expect(fs.readFileSync('/current/working/dir/foo.txt', 'utf8')).toEqual(
      'test',
    );
  });

  describe('createWriteStream', () => {
    it('writes a file', done => {
      const st = fs.createWriteStream('/foo.txt', {emitClose: true});
      let opened = false;
      let closed = false;
      st.on('open', () => (opened = true));
      st.on('close', () => (closed = true));
      st.write('test');
      st.write(' foo');
      st.end();

      st.on('close', () => {
        expect(opened).toBe(true);
        expect(closed).toBe(true);
        expect(fs.readFileSync('/foo.txt', 'utf8')).toEqual('test foo');

        done();
      });
    });

    it('writes a file, as buffer', done => {
      const st = fs.createWriteStream('/foo.txt');
      let opened = false;
      st.on('open', () => (opened = true));
      st.write(Buffer.from('test'));
      st.write(Buffer.from(' foo'));
      st.end(() => {
        expect(opened).toBe(true);
        expect(fs.readFileSync('/foo.txt', 'utf8')).toEqual('test foo');
        done();
      });
    });

    it('writes a file, with a starting position', done => {
      fs.writeFileSync('/foo.txt', 'test bar');
      const st = fs.createWriteStream('/foo.txt', {start: 5, flags: 'r+'});
      let opened = false;
      st.on('open', () => (opened = true));
      st.write('beep');
      st.end(() => {
        expect(opened).toBe(true);
        expect(fs.readFileSync('/foo.txt', 'utf8')).toEqual('test beep');
        done();
      });
    });

    it('writes a file with a custom fd', done => {
      const fd = fs.openSync('/bar.txt', 'w');
      const st = fs.createWriteStream('/foo.txt', {fd});
      let opened = false;
      st.on('open', () => (opened = true));
      st.write('beep boop');
      st.end(() => {
        expect(opened).toBe(false);
        expect(fs.readFileSync('/bar.txt', 'utf8')).toEqual('beep boop');
        done();
      });
    });
  });

  describe('createReadStream', () => {
    const REF_STR = 'foo bar baz glo beep boop';

    beforeEach(() => {
      fs.writeFileSync('/foo.txt', REF_STR);
    });

    it('reads a file', async () => {
      const str = await readWithReadStream(null);
      expect(str).toBe(REF_STR);
    });

    it('reads a file, with a starting position', async () => {
      const str = await readWithReadStream({start: 4});
      expect(str).toBe(REF_STR.substring(4));
    });

    it('reads a file, with an ending position', async () => {
      const str = await readWithReadStream({end: 14});
      // The `end` option is inclusive, but it's exclusive for `substring`,
      // hence the difference between 14 and 15.
      expect(str).toBe(REF_STR.substring(0, 15));
    });

    it('reads a file, with starting and ending positions', async () => {
      const str = await readWithReadStream({start: 8, end: 14});
      // The `end` option is inclusive, but it's exclusive for `substring`,
      // hence the difference between 14 and 15.
      expect(str).toBe(REF_STR.substring(8, 15));
    });

    it('reads a file, with custom flags and mode', async () => {
      const str = await readWithReadStream(
        {flags: 'wx+', mode: 0o600},
        '/glo.txt',
      );
      expect(str).toBe('');
      // Does not work yet, statSync needs to be fixed to support `mode`.
      // expect(fs.statSync('/glo.txt').mode).toBe(0o600);
    });

    function readWithReadStream(
      options:
        | null
        | {end: number}
        | {end: number, start: number}
        | {flags: string, mode: number}
        | {start: number},
      filePath: string = '/foo.txt',
    ) {
      return new Promise(resolve => {
        const st = fs.createReadStream(
          filePath,
          options != null ? {...options, encoding: 'utf8'} : 'utf8',
        );
        let opened = false;
        let closed = false;
        st.on('open', () => (opened = true));
        st.on('close', () => (closed = true));
        expect((st: any).path).toBe(filePath);
        let str = '';
        st.on('data', chunk => {
          expect(opened).toBe(true);
          str += chunk;
        });
        st.on('end', () => {
          expect(closed).toBe(true);
          resolve(str);
        });
      });
    }

    it('reads a file as buffer', done => {
      const st = fs.createReadStream('/foo.txt');
      let buffer = Buffer.alloc(0);
      st.on('data', chunk => {
        buffer = Buffer.concat([buffer, chunk]);
      });
      st.on('end', () => {
        expect(buffer.toString('utf8')).toBe(REF_STR);
        done();
      });
    });

    it('reads a file with a custom fd', done => {
      fs.writeFileSync('/bar.txt', 'tadam');
      const fd = fs.openSync('/bar.txt', 'r');
      const st = fs.createReadStream('/foo.txt', {fd, encoding: 'utf8'});
      let opened = false;
      let closed = false;
      st.on('open', () => (opened = true));
      st.on('close', () => (closed = true));
      expect((st: any).path).toBe('/foo.txt');
      let str = '';
      st.on('data', chunk => {
        str += chunk;
      });
      st.on('end', () => {
        expect(opened).toBe(false);
        expect(closed).toBe(true);
        expect(str).toBe('tadam');
        done();
      });
    });

    it('reads a file with a custom fd, no auto-close', done => {
      fs.writeFileSync('/bar.txt', 'tadam');
      const fd = fs.openSync('/bar.txt', 'r');
      const st = fs.createReadStream('/foo.txt', {
        fd,
        encoding: 'utf8',
        autoClose: false,
      });
      let opened = false;
      let closed = false;
      st.on('open', () => (opened = true));
      st.on('close', () => (closed = true));
      expect((st: any).path).toBe('/foo.txt');
      let str = '';
      st.on('data', chunk => {
        str += chunk;
      });
      st.on('end', () => {
        expect(opened).toBe(false);
        expect(closed).toBe(false);
        expect(str).toBe('tadam');
        fs.closeSync(fd);
        done();
      });
    });
  });

  it('truncates a file that already exist', () => {
    fs.writeFileSync('/foo.txt', 'test');
    fs.writeFileSync('/foo.txt', 'hop');
    expect(fs.readFileSync('/foo.txt', 'utf8')).toEqual('hop');
  });

  it('can write to an arbitrary position in a file', () => {
    const fd = fs.openSync('/foo.txt', 'w');
    fs.writeSync(fd, 'test');
    fs.writeSync(fd, 'a', 1);
    fs.writeSync(fd, 'e', 4);
    fs.closeSync(fd);
    expect(fs.readFileSync('/foo.txt', 'utf8')).toEqual('taste');
  });

  it('can check a file exist', () => {
    fs.writeFileSync('/foo.txt', 'test');
    expect(fs.existsSync('/foo.txt')).toBe(true);
    expect(fs.existsSync('/bar.txt')).toBe(false);
    expect(fs.existsSync('/glo/bar.txt')).toBe(false);
  });

  it('can write then read a file in a subdirectory', () => {
    fs.mkdirSync('/glo');
    fs.writeFileSync('/glo/foo.txt', 'test');
    expect(fs.readFileSync('/glo/foo.txt', 'utf8')).toEqual('test');
  });

  it('can write then read via a symlinked file', () => {
    fs.symlinkSync('foo.txt', '/bar.txt');
    fs.writeFileSync('/bar.txt', 'test');
    expect(fs.readFileSync('/bar.txt', 'utf8')).toEqual('test');
    expect(fs.readFileSync('/foo.txt', 'utf8')).toEqual('test');
  });

  it('can write then read via a symlinked file (absolute path)', () => {
    fs.symlinkSync('/foo.txt', '/bar.txt');
    fs.writeFileSync('/bar.txt', 'test');
    expect(fs.readFileSync('/bar.txt', 'utf8')).toEqual('test');
    expect(fs.readFileSync('/foo.txt', 'utf8')).toEqual('test');
  });

  it('can write then read a file in a symlinked directory', () => {
    fs.mkdirSync('/glo');
    fs.symlinkSync('glo', '/baz');
    fs.writeFileSync('/baz/foo.txt', 'test');
    expect(fs.readFileSync('/baz/foo.txt', 'utf8')).toEqual('test');
    expect(fs.readFileSync('/glo/foo.txt', 'utf8')).toEqual('test');
  });

  it('gives the real path for a symbolic link to a non-existent file', () => {
    fs.symlinkSync('foo.txt', '/bar.txt');
    // This *is* expected to work even if the file doesn't actually exist.
    expect(fs.realpathSync('/bar.txt')).toEqual('/foo.txt');
  });

  it('gives the real path for a symbolic link to a file', () => {
    fs.writeFileSync('/foo.txt', 'test');
    fs.symlinkSync('foo.txt', '/bar.txt');
    expect(fs.realpathSync('/bar.txt')).toEqual('/foo.txt');
  });

  it('gives the real path via a symlinked directory', () => {
    fs.mkdirSync('/glo');
    fs.symlinkSync('glo', '/baz');
    expect(fs.realpathSync('/baz/foo.txt')).toEqual('/glo/foo.txt');
  });

  it('realpathSync.native is supported', () => {
    fs.mkdirSync('/glo');
    fs.symlinkSync('glo', '/baz');
    // $FlowFixMe: Ideally this should typecheck.
    const realpathSyncNative = fs.realpathSync.native;
    expect(realpathSyncNative('/baz/foo.txt')).toEqual('/glo/foo.txt');
  });

  describe('stat', () => {
    it('works for a regular file', () => {
      fs.writeFileSync('/foo.txt', 'test');
      const st = fs.statSync('/foo.txt');
      expect(st.isFile()).toBe(true);
      expect(st.isDirectory()).toBe(false);
      expect(st.isSymbolicLink()).toBe(false);
      expect(st.size).toBe(4);
    });

    it('works for a symlinked file', () => {
      fs.writeFileSync('/foo.txt', 'test');
      fs.symlinkSync('foo.txt', '/bar.txt');
      const st = fs.statSync('/bar.txt');
      expect(st.isFile()).toBe(true);
      expect(st.isDirectory()).toBe(false);
      expect(st.isSymbolicLink()).toBe(false);
      expect(st.size).toBe(4);
    });
  });

  describe('lstat', () => {
    it('works for a regular file', () => {
      fs.writeFileSync('/foo.txt', 'test');
      const st = fs.lstatSync('/foo.txt');
      expect(st.isFile()).toBe(true);
      expect(st.isDirectory()).toBe(false);
      expect(st.isSymbolicLink()).toBe(false);
      expect(st.size).toBe(4);
    });

    it('works for a symlink', () => {
      const linkStr = 'foo/bar/baz.txt';
      fs.symlinkSync(linkStr, '/bar.txt');
      const st = fs.lstatSync('/bar.txt');
      expect(st.isFile()).toBe(false);
      expect(st.isDirectory()).toBe(false);
      expect(st.isSymbolicLink()).toBe(true);
      expect(st.size).toBe(linkStr.length);
    });
  });

  describe('readdirsync', () => {
    it('able to list files of a directory', () => {
      fs.mkdirSync('/baz');
      fs.writeFileSync('/baz/foo.txt', 'test');
      fs.writeFileSync('/baz/bar.txt', 'boop');
      fs.symlinkSync('glo', '/baz/glo.txt');
      expect(fs.readdirSync('/baz')).toEqual(['foo.txt', 'bar.txt', 'glo.txt']);
    });

    describe('withFileTypes', () => {
      let entries: Array<fs.Dirent>;

      beforeEach(() => {
        fs.mkdirSync('/baz');
        fs.writeFileSync('/baz/foo.txt', 'test');
        fs.writeFileSync('/baz/bar.txt', 'boop');
        fs.symlinkSync('glo', '/baz/glo.txt');
        fs.mkdirSync('/baz/subdir');
        entries = (fs.readdirSync('/baz', {
          withFileTypes: true,
        }): $FlowFixMe);
      });

      it('returns Dirent objects', () => {
        expect.assertions(4);
        for (const entry of entries) {
          expect(entry).toBeInstanceOf(fs.Dirent);
        }
      });

      it('regular file', () => {
        const entry = entries[0];
        expect(entry.name).toBe('foo.txt');
        expect(entry.isFile()).toBe(true);
        expect(entry.isSymbolicLink()).toBe(false);
        expect(entry.isDirectory()).toBe(false);
        expect(entry.isBlockDevice()).toBe(false);
        expect(entry.isCharacterDevice()).toBe(false);
        expect(entry.isFIFO()).toBe(false);
        expect(entry.isSocket()).toBe(false);
      });

      it('target of a symlink', () => {
        const entry = entries[1];
        expect(entry.name).toBe('bar.txt');
        expect(entry.isFile()).toBe(true);
        expect(entry.isSymbolicLink()).toBe(false);
        expect(entry.isDirectory()).toBe(false);
        expect(entry.isBlockDevice()).toBe(false);
        expect(entry.isCharacterDevice()).toBe(false);
        expect(entry.isFIFO()).toBe(false);
        expect(entry.isSocket()).toBe(false);
      });

      it('symlink', () => {
        const entry = entries[2];
        expect(entry.name).toBe('glo.txt');
        expect(entry.isFile()).toBe(false);
        expect(entry.isSymbolicLink()).toBe(true);
        expect(entry.isDirectory()).toBe(false);
        expect(entry.isBlockDevice()).toBe(false);
        expect(entry.isCharacterDevice()).toBe(false);
        expect(entry.isFIFO()).toBe(false);
        expect(entry.isSocket()).toBe(false);
      });

      it('subdirectory', () => {
        const entry = entries[3];
        expect(entry.name).toBe('subdir');
        expect(entry.isFile()).toBe(false);
        expect(entry.isSymbolicLink()).toBe(false);
        expect(entry.isDirectory()).toBe(true);
        expect(entry.isBlockDevice()).toBe(false);
        expect(entry.isCharacterDevice()).toBe(false);
        expect(entry.isFIFO()).toBe(false);
        expect(entry.isSocket()).toBe(false);
      });

      it('Buffer support', () => {
        const entriesWithBuffers: Array<fs.Dirent> = (fs.readdirSync('/baz', {
          withFileTypes: true,
          encoding: 'buffer',
        }): $FlowFixMe);
        for (const [i, name] of [
          'foo.txt',
          'bar.txt',
          'glo.txt',
          'subdir',
        ].entries()) {
          expect(entriesWithBuffers[i]).toBeInstanceOf(fs.Dirent);
          expect(entriesWithBuffers[i]).toHaveProperty(
            'name',
            Buffer.from(name, 'utf8'),
          );
        }
      });
    });
  });

  describe('watch', () => {
    it('reports changed files', () => {
      const changedPaths = [];
      fs.writeFileSync('/foo.txt', '');
      fs.writeFileSync('/bar.txt', '');
      const watcher = collectWatchEvents('/', {}, changedPaths);
      fs.writeFileSync('/foo.txt', 'test');
      fs.writeFileSync('/bar.txt', 'tadam');
      expect(changedPaths).toEqual([
        ['change', 'foo.txt'],
        ['change', 'bar.txt'],
      ]);
      watcher.close();
    });

    it('does not report nested changed files if non-recursive', () => {
      const changedPaths = [];
      fs.mkdirSync('/foo');
      fs.writeFileSync('/foo/bar.txt', '');
      const watcher = collectWatchEvents('/', {}, changedPaths);
      fs.writeFileSync('/foo/bar.txt', 'test');
      expect(changedPaths).toEqual([]);
      watcher.close();
    });

    it('does report nested changed files if recursive', () => {
      const changedPaths = [];
      fs.mkdirSync('/foo');
      fs.writeFileSync('/foo/bar.txt', '');
      const watcher = collectWatchEvents('/', {recursive: true}, changedPaths);
      fs.writeFileSync('/foo/bar.txt', 'test');
      expect(changedPaths).toEqual([['change', 'foo/bar.txt']]);
      watcher.close();
    });

    it('reports created files', () => {
      const changedPaths = [];
      const watcher = collectWatchEvents('/', {}, changedPaths);
      const fd = fs.openSync('/foo.txt', 'w');
      expect(changedPaths).toEqual([['rename', 'foo.txt']]);
      fs.closeSync(fd);
      watcher.close();
    });

    it('reports unlinked files', () => {
      const changedPaths = [];
      fs.writeFileSync('/bar.txt', 'text');
      const watcher = collectWatchEvents('/', {}, changedPaths);
      fs.unlinkSync('/bar.txt');
      expect(changedPaths).toEqual([['rename', 'bar.txt']]);
      watcher.close();
    });

    it('reports changed files when watching a file directly', () => {
      const changedPaths = [];
      fs.writeFileSync('/foo.txt', '');
      const watcher = collectWatchEvents('/foo.txt', {}, changedPaths);
      fs.writeFileSync('/foo.txt', 'test');
      expect(changedPaths).toEqual([['change', 'foo.txt']]);
      watcher.close();
    });

    it('does not report changes when just reading a file', () => {
      const changedPaths = [];
      fs.writeFileSync('/foo.txt', '');
      const watcher = collectWatchEvents('/', {}, changedPaths);
      fs.readFileSync('/foo.txt');
      expect(changedPaths).toEqual([]);
      watcher.close();
    });

    it('reports source and destination files when renaming', () => {
      const changedPaths = [];
      fs.writeFileSync('/src.txt', 'text');
      const watcher = collectWatchEvents('/', {}, changedPaths);
      fs.renameSync('/src.txt', '/dest.txt');
      expect(changedPaths).toEqual([
        ['rename', 'dest.txt'],
        ['rename', 'src.txt'],
      ]);
      watcher.close();
    });

    it('reports destination file twice when renaming and overwriting ', () => {
      const changedPaths = [];
      fs.writeFileSync('/src.txt', 'text');
      fs.writeFileSync('/dest.txt', 'overwriteThis');
      const watcher = collectWatchEvents('/', {}, changedPaths);
      fs.renameSync('/src.txt', '/dest.txt');
      expect(changedPaths).toEqual([
        ['rename', 'dest.txt'],
        ['rename', 'dest.txt'],
        ['rename', 'src.txt'],
      ]);
      watcher.close();
    });

    it('reports new hard links', () => {
      const changedPaths = [];
      fs.writeFileSync('/foo.txt', 'text');
      const watcher = collectWatchEvents('/', {}, changedPaths);
      fs.linkSync('/foo.txt', '/bar.txt');
      expect(changedPaths).toEqual([['rename', 'bar.txt']]);
      watcher.close();
    });

    it('reports truncated files', () => {
      const changedPaths = [];
      fs.writeFileSync('/bar.txt', 'text');
      const watcher = collectWatchEvents('/', {}, changedPaths);
      fs.truncateSync('/bar.txt');
      expect(changedPaths).toEqual(
        // TODO: Emit exactly one change event
        expect.arrayContaining([['change', 'bar.txt']]),
      );
      watcher.close();
    });

    function collectWatchEvents(
      entPath: string,
      /* $FlowFixMe[missing-local-annot] The type annotation(s) required by
       * Flow's LTI update could not be added via codemod */
      options,
      events: Array<Array<?(Buffer | string | 'change' | 'rename')>>,
    ) {
      return fs.watch(entPath, options, (eventName, filePath) => {
        events.push([eventName, filePath]);
      });
    }
  });

  describe('unlink', () => {
    it('removes a file', () => {
      fs.writeFileSync('/foo.txt', 'test');
      expect(fs.readdirSync('/')).toEqual(['foo.txt']);
      fs.unlinkSync('/foo.txt');
      expect(fs.readdirSync('/')).toEqual([]);
      try {
        fs.readFileSync('/foo.txt', 'utf8');
        throw new Error('should not reach here');
      } catch (error) {
        if (error.code !== 'ENOENT') {
          throw error;
        }
      }
    });

    it('removes a symlink (not the linked file)', () => {
      fs.writeFileSync('/foo.txt', 'test');
      fs.symlinkSync('foo.txt', '/bar.txt');
      expect(fs.readdirSync('/')).toEqual(['foo.txt', 'bar.txt']);
      fs.unlinkSync('/bar.txt');
      expect(fs.readdirSync('/')).toEqual(['foo.txt']);
    });

    it('throws for non existent files', () => {
      try {
        fs.unlinkSync('/nonexistent.txt');
        throw new Error('should not reach here');
      } catch (error) {
        if (error.code !== 'ENOENT') {
          throw error;
        }
      }
    });

    it('throws for directories', () => {
      fs.mkdirSync('/foo');
      try {
        fs.unlinkSync('/foo');
        throw new Error('should not reach here');
      } catch (error) {
        if (error.code !== 'EISDIR') {
          throw error;
        }
      }
    });
  });

  describe('readlink', () => {
    it('reads a symlink target', () => {
      fs.symlinkSync('foo.txt', '/bar.txt');
      expect(fs.readlinkSync('/bar.txt')).toBe('foo.txt');
    });

    it('reads a symlink target as buffer', () => {
      fs.symlinkSync('foo.txt', '/bar.txt');
      expect(fs.readlinkSync('/bar.txt', 'buffer')).toEqual(
        Buffer.from('foo.txt'),
      );
    });

    it('throws when trying to read a regular file', () => {
      fs.writeFileSync('/foo.txt', 'test');
      expectFsError('EINVAL', () => fs.readlinkSync('/foo.txt'));
    });
  });

  it('throws when trying to read inexistent file', () => {
    expectFsError('ENOENT', () => fs.readFileSync('/foo.txt'));
  });

  it('throws when trying to read file via inexistent directory', () => {
    fs.writeFileSync('/foo.txt', 'test');
    // It is *not* expected to simplify the path before resolution. Because
    // `glo` does not exist along the way, it is expected to fail.
    expectFsError('ENOENT', () => fs.readFileSync('/glo/../foo.txt'));
  });

  it('throws when trying to create symlink over existing file', () => {
    fs.writeFileSync('/foo.txt', 'test');
    expectFsError('EEXIST', () => fs.symlinkSync('bar', '/foo.txt'));
  });

  it('throws when trying to write a directory entry', () => {
    fs.mkdirSync('/glo');
    expectFsError('EISDIR', () => fs.writeFileSync('/glo', 'test'));
  });

  it('throws when trying to read a directory entry', () => {
    fs.mkdirSync('/glo');
    expectFsError('EISDIR', () => fs.readFileSync('/glo'));
  });

  it('throws when trying to read inexistent file (async)', done => {
    fs.readFile('/foo.txt', error => {
      if (error.code !== 'ENOENT') {
        // $FlowFixMe - Upgrading the Jest definition revealed errors
        done(error);
        return;
      }
      expect(error.message).toMatchSnapshot();
      done();
    });
  });

  it('throws when trying to read directory as file', () => {
    fs.mkdirSync('/glo');
    expectFsError('EISDIR', () => fs.readFileSync('/glo'));
  });

  it('throws when trying to write to a win32-style path', () => {
    expectFsError('ENOENT', () => fs.writeFileSync('C:\\foo.txt', ''));
  });

  it('throws when trying to read file with trailing slash', () => {
    fs.writeFileSync('/foo.txt', 'test');
    expectFsError('ENOTDIR', () => fs.readFileSync('/foo.txt/'));
  });

  it('throws when finding a symlink loop', () => {
    fs.symlinkSync('foo.txt', '/bar.txt');
    fs.symlinkSync('bar.txt', '/glo.txt');
    fs.symlinkSync('glo.txt', '/foo.txt');
    expectFsError('ELOOP', () => fs.readFileSync('/foo.txt'));
  });

  it('throws when trying to write to an inexistent file descriptor', () => {
    expectFsError('EBADF', () => fs.writeSync(42, Buffer.from([1])));
  });

  it('throws when trying to write to a read-only file descriptor', () => {
    fs.writeFileSync('/foo.txt', 'test');
    const fd = fs.openSync('/foo.txt', 'r');
    expectFsError('EBADF', () => fs.writeSync(fd, Buffer.from([1])));
  });

  it('throws when trying to open too many files', () => {
    fs.writeFileSync('/foo.txt', 'test');
    expectFsError('EMFILE', () => {
      for (let i = 0; i < 1000; ++i) {
        fs.openSync('/foo.txt', 'r');
      }
    });
  });

  it('supports copying files', () => {
    const source = '/source-file';
    const data = 'arbitrary data';
    fs.writeFileSync(source, data);

    const dest = '/dest-file';
    fs.copyFileSync(source, dest);
    expect(fs.readFileSync(dest, 'utf8')).toBe(data);

    const dest2 = '/dest-file-with-flags';
    fs.copyFileSync(source, dest2, fs.constants.COPYFILE_FICLONE);
    expect(fs.readFileSync(dest2, 'utf8')).toBe(data);
  });

  it('supports COPYFILE_EXCL for copyFile', () => {
    const data = 'arbitrary data';
    const source = '/source-file';
    const dest = '/dest-file';
    fs.writeFileSync(source, data);
    fs.writeFileSync(dest, '');

    expectFsError('EEXIST', () =>
      fs.copyFileSync(
        source,
        dest,
        // pass bitfield with more bits set, to avoid equality test.
        fs.constants.COPYFILE_EXCL | fs.constants.COPYFILE_FICLONE,
      ),
    );

    // ensure that copyFileSync can overwrite when COPYFILE_EXCL is NOT passed.
    fs.copyFileSync(source, dest);
    expect(fs.readFileSync(source, 'utf8')).toBe(data);
  });

  describe('renameSync', () => {
    it('errors when the source does not exist', () => {
      fs.writeFileSync('/dest', 'TRY_TO_OVERWRITE_ME');
      expectFsError('ENOENT', () => fs.renameSync('/source', '/dest'));
      expect(fs.readFileSync('/dest', 'utf8')).toBe('TRY_TO_OVERWRITE_ME');
    });

    it('errors when the destination is in a nonexistent directory', () => {
      fs.writeFileSync('/source', 'DATA');

      expectFsError('ENOENT', () => fs.renameSync('/source', '/bad/dest'));
      expect(fs.existsSync('/source')).toBe(true);
      expect(fs.existsSync('/dest')).toBe(false);
      expect(fs.readFileSync('/source', 'utf8')).toBe('DATA');
    });

    it('errors when making a directory its own subdirectory', () => {
      fs.mkdirSync('/source');
      fs.writeFileSync('/source/data', 'DATA');

      expectFsError('EINVAL', () => fs.renameSync('/source', '/source/subdir'));
      expect(fs.readFileSync('/source/data', 'utf8')).toBe('DATA');
    });

    it('errors when using a file as a directory in the source path', () => {
      fs.writeFileSync('/source', 'DATA');

      expectFsError('ENOTDIR', () => fs.renameSync('/source/nope', '/dest'));
      expect(fs.readFileSync('/source', 'utf8')).toBe('DATA');
    });

    it('errors when using a file as a directory in the destination path', () => {
      fs.writeFileSync('/source', 'DATA');
      fs.writeFileSync('/dest', 'TRY_TO_OVERWRITE_ME');

      expectFsError('ENOTDIR', () => fs.renameSync('/source', '/dest/nope'));
      expect(fs.readFileSync('/source', 'utf8')).toBe('DATA');
      expect(fs.readFileSync('/dest', 'utf8')).toBe('TRY_TO_OVERWRITE_ME');
    });

    describe('when the destination is valid and does not exist', () => {
      it('renames a file', () => {
        fs.writeFileSync('/source', 'DATA');

        fs.renameSync('/source', '/dest');
        expect(fs.existsSync('/source')).toBe(false);
        expect(fs.readFileSync('/dest', 'utf8')).toBe('DATA');
      });

      it('renames a symbolic link', () => {
        fs.writeFileSync('/sourceReal', 'DATA');
        fs.symlinkSync('/sourceReal', '/source');

        fs.renameSync('/source', '/dest');

        expect(fs.existsSync('/source')).toBe(false);
        expect(fs.readFileSync('/dest', 'utf8')).toBe('DATA');
        expect(fs.readlinkSync('/dest')).toBe('/sourceReal');
      });

      it('renames a directory', () => {
        fs.mkdirSync('/source');
        fs.writeFileSync('/source/data', 'DATA');

        fs.renameSync('/source', '/dest');
        expect(fs.existsSync('/source')).toBe(false);
        expect(fs.readFileSync('/dest/data', 'utf8')).toBe('DATA');
      });
    });

    describe('when the source is valid and the destination exists', () => {
      it('file -> file succeeds', () => {
        fs.writeFileSync('/source', 'DATA');
        fs.writeFileSync('/dest', 'OVERWRITE_ME');

        fs.renameSync('/source', '/dest');
        expect(fs.existsSync('/source')).toBe(false);
        expect(fs.readFileSync('/dest', 'utf8')).toBe('DATA');
      });

      it('file -> itself succeeds', () => {
        fs.writeFileSync('/source', 'DATA');

        fs.renameSync('/source', '/source');
        expect(fs.readFileSync('/source', 'utf8')).toBe('DATA');
      });

      it('file -> other hard link to itself succeeds', () => {
        fs.writeFileSync('/source', 'DATA');
        fs.linkSync('/source', '/source_alt');

        fs.renameSync('/source', '/source_alt');
        expect(fs.readFileSync('/source', 'utf8')).toBe('DATA');
        expect(fs.readFileSync('/source_alt', 'utf8')).toBe('DATA');

        // The two are still linked
        fs.writeFileSync('/source', 'NEW_DATA');
        expect(fs.readFileSync('/source', 'utf8')).toBe('NEW_DATA');
        expect(fs.readFileSync('/source_alt', 'utf8')).toBe('NEW_DATA');
      });

      it('file -> directory succeeds', () => {
        fs.writeFileSync('/source', 'DATA');
        fs.mkdirSync('/dest');

        fs.renameSync('/source', '/dest');
        expect(fs.existsSync('/source')).toBe(false);
        expect(fs.readFileSync('/dest', 'utf8')).toBe('DATA');
      });

      it('file -> symbolic link succeeds', () => {
        fs.writeFileSync('/source', 'DATA');
        fs.writeFileSync('/destReal', 'TRY_TO_OVERWRITE_ME');
        fs.symlinkSync('/destReal', '/dest');

        fs.renameSync('/source', '/dest');
        expect(fs.existsSync('/source')).toBe(false);
        expect(fs.readFileSync('/dest', 'utf8')).toBe('DATA');
        expect(fs.statSync('/dest').isSymbolicLink()).toBe(false);
        expect(fs.readFileSync('/destReal', 'utf8')).toBe(
          'TRY_TO_OVERWRITE_ME',
        );
      });

      it('symbolic link -> file succeeds', () => {
        fs.writeFileSync('/sourceReal', 'DATA');
        fs.symlinkSync('/sourceReal', '/source');
        fs.writeFileSync('/dest', 'OVERWRITE_ME');

        fs.renameSync('/source', '/dest');

        expect(fs.existsSync('/source')).toBe(false);
        expect(fs.readFileSync('/dest', 'utf8')).toBe('DATA');
        expect(fs.readlinkSync('/dest')).toBe('/sourceReal');
      });

      it('symbolic link -> directory succeeds', () => {
        fs.writeFileSync('/sourceReal', 'DATA');
        fs.symlinkSync('/sourceReal', '/source');
        fs.mkdirSync('/dest');

        fs.renameSync('/source', '/dest');

        expect(fs.existsSync('/source')).toBe(false);
        expect(fs.readFileSync('/dest', 'utf8')).toBe('DATA');
        expect(fs.readlinkSync('/dest')).toBe('/sourceReal');
      });

      it('symbolic link -> symbolic link succeeds', () => {
        fs.writeFileSync('/sourceReal', 'DATA');
        fs.symlinkSync('/sourceReal', '/source');
        fs.writeFileSync('/destReal', 'TRY_TO_OVERWRITE_ME');
        fs.symlinkSync('/destReal', '/dest');

        fs.renameSync('/source', '/dest');

        expect(fs.existsSync('/source')).toBe(false);
        expect(fs.readFileSync('/dest', 'utf8')).toBe('DATA');
        expect(fs.readlinkSync('/dest')).toBe('/sourceReal');
        expect(fs.readFileSync('/destReal', 'utf8')).toBe(
          'TRY_TO_OVERWRITE_ME',
        );
      });

      it('symbolic link -> itself succeeds', () => {
        fs.writeFileSync('/sourceReal', 'DATA');
        fs.symlinkSync('/sourceReal', '/source');

        fs.renameSync('/source', '/source');

        expect(fs.existsSync('/source')).toBe(true);
        expect(fs.readFileSync('/source', 'utf8')).toBe('DATA');
        expect(fs.readlinkSync('/source')).toBe('/sourceReal');
      });

      it('directory -> file errors', () => {
        fs.mkdirSync('/source');
        fs.writeFileSync('/dest', 'TRY_TO_OVERWRITE_ME');

        expectFsError('EISDIR', () => fs.renameSync('/source', '/dest'));
        expect(fs.statSync('/source').isDirectory()).toBe(true);
        expect(fs.readFileSync('/dest', 'utf8')).toBe('TRY_TO_OVERWRITE_ME');
      });

      it('directory -> symbolic link errors', () => {
        fs.mkdirSync('/source');
        fs.writeFileSync('/destReal', 'TRY_TO_OVERWRITE_ME');
        fs.symlinkSync('/destReal', '/dest');

        expectFsError('EISDIR', () => fs.renameSync('/source', '/dest'));
        expect(fs.statSync('/source').isDirectory()).toBe(true);
        expect(fs.readFileSync('/dest', 'utf8')).toBe('TRY_TO_OVERWRITE_ME');
        expect(fs.readlinkSync('/dest')).toBe('/destReal');
      });

      it('directory -> empty directory succeeds', () => {
        fs.mkdirSync('/source');
        fs.writeFileSync('/source/data', 'DATA');
        fs.mkdirSync('/dest');

        fs.renameSync('/source', '/dest');
        expect(fs.existsSync('/source')).toBe(false);
        expect(fs.readFileSync('/dest/data', 'utf8')).toBe('DATA');
      });

      it('directory -> non-empty directory errors', () => {
        fs.mkdirSync('/source');
        fs.writeFileSync('/source/data', 'DATA');
        fs.mkdirSync('/dest');
        fs.writeFileSync('/dest/nope', 'TRY_TO_OVERWRITE_ME');

        expectFsError('ENOTEMPTY', () => fs.renameSync('/source', '/dest'));
        expect(fs.readFileSync('/source/data', 'utf8')).toBe('DATA');
        expect(fs.readFileSync('/dest/nope', 'utf8')).toBe(
          'TRY_TO_OVERWRITE_ME',
        );
      });

      it('directory -> itself succeeds', () => {
        fs.mkdirSync('/source');
        fs.writeFileSync('/source/data', 'DATA');

        fs.renameSync('/source', '/source');
        expect(fs.readFileSync('/source/data', 'utf8')).toBe('DATA');
      });
    });
  });

  describe('linkSync', () => {
    it('errors when the source does not exist', () => {
      fs.writeFileSync('/dest', 'TRY_TO_OVERWRITE_ME');
      expectFsError('ENOENT', () => fs.linkSync('/source', '/dest'));
      expect(fs.readFileSync('/dest', 'utf8')).toBe('TRY_TO_OVERWRITE_ME');
    });

    it('errors when the destination is in a nonexistent directory', () => {
      fs.writeFileSync('/source', 'DATA');

      expectFsError('ENOENT', () => fs.linkSync('/source', '/bad/dest'));
      expect(fs.existsSync('/source')).toBe(true);
      expect(fs.existsSync('/dest')).toBe(false);
      expect(fs.readFileSync('/source', 'utf8')).toBe('DATA');
    });

    it('errors when using a file as a directory in the source path', () => {
      fs.writeFileSync('/source', 'DATA');

      expectFsError('ENOTDIR', () => fs.linkSync('/source/nope', '/dest'));
      expect(fs.readFileSync('/source', 'utf8')).toBe('DATA');
    });

    it('errors when using a file as a directory in the destination path', () => {
      fs.writeFileSync('/source', 'DATA');
      fs.writeFileSync('/dest', 'TRY_TO_OVERWRITE_ME');

      expectFsError('ENOTDIR', () => fs.linkSync('/source', '/dest/nope'));
      expect(fs.readFileSync('/source', 'utf8')).toBe('DATA');
      expect(fs.readFileSync('/dest', 'utf8')).toBe('TRY_TO_OVERWRITE_ME');
    });

    it('links a file', () => {
      fs.writeFileSync('/source', 'DATA');

      fs.linkSync('/source', '/dest');
      expect(fs.readFileSync('/source', 'utf8')).toBe('DATA');
      expect(fs.readFileSync('/dest', 'utf8')).toBe('DATA');
    });

    describe('relationship after linking', () => {
      it('unlinking the source keeps the destination in place', () => {
        fs.writeFileSync('/source', 'DATA');

        fs.linkSync('/source', '/dest');
        fs.unlinkSync('/source');
        expect(fs.existsSync('/source')).toBe(false);
        expect(fs.readFileSync('/dest', 'utf8')).toBe('DATA');
      });

      it('unlinking the destination keeps the source in place', () => {
        fs.writeFileSync('/source', 'DATA');

        fs.linkSync('/source', '/dest');
        fs.unlinkSync('/dest');
        expect(fs.existsSync('/dest')).toBe(false);
        expect(fs.readFileSync('/source', 'utf8')).toBe('DATA');
      });

      it('writing to the destination updates the source', () => {
        fs.writeFileSync('/source', 'DATA');

        fs.linkSync('/source', '/dest');
        fs.writeFileSync('/dest', 'NEW_DATA');
        expect(fs.readFileSync('/source', 'utf8')).toBe('NEW_DATA');
        expect(fs.readFileSync('/dest', 'utf8')).toBe('NEW_DATA');
      });

      it('writing to the source updates the destination', () => {
        fs.writeFileSync('/source', 'DATA');

        fs.linkSync('/source', '/dest');
        fs.writeFileSync('/source', 'NEW_DATA');
        expect(fs.readFileSync('/source', 'utf8')).toBe('NEW_DATA');
        expect(fs.readFileSync('/dest', 'utf8')).toBe('NEW_DATA');
      });
    });

    describe('never overwrites the destination', () => {
      it('file -> file', () => {
        fs.writeFileSync('/source', 'DATA');
        fs.writeFileSync('/dest', 'TRY_TO_OVERWRITE_ME');

        expectFsError('EEXIST', () => fs.linkSync('/source', '/dest'));
        expect(fs.readFileSync('/source', 'utf8')).toBe('DATA');
        expect(fs.readFileSync('/dest', 'utf8')).toBe('TRY_TO_OVERWRITE_ME');
      });

      it('file -> itself', () => {
        fs.writeFileSync('/source', 'DATA');

        expectFsError('EEXIST', () => fs.linkSync('/source', '/source'));
        expect(fs.readFileSync('/source', 'utf8')).toBe('DATA');
      });

      it('file -> directory', () => {
        fs.writeFileSync('/source', 'DATA');
        fs.mkdirSync('/dest');

        expectFsError('EEXIST', () => fs.linkSync('/source', '/dest'));
        expect(fs.readFileSync('/source', 'utf8')).toBe('DATA');
        expect(fs.statSync('/dest').isDirectory()).toBe(true);
      });

      it('file -> symbolic link', () => {
        fs.writeFileSync('/source', 'DATA');
        fs.writeFileSync('/destReal', 'TRY_TO_OVERWRITE_ME');
        fs.symlinkSync('/destReal', '/dest');

        expectFsError('EEXIST', () => fs.linkSync('/source', '/dest'));
        expect(fs.readFileSync('/source', 'utf8')).toBe('DATA');
        expect(fs.readlinkSync('/dest')).toBe('/destReal');
        expect(fs.readFileSync('/dest', 'utf8')).toBe('TRY_TO_OVERWRITE_ME');
      });

      it('symbolic link -> file', () => {
        fs.writeFileSync('/sourceReal', 'DATA');
        fs.symlinkSync('/sourceReal', '/source');
        fs.writeFileSync('/dest', 'TRY_TO_OVERWRITE_ME');

        expectFsError('EEXIST', () => fs.linkSync('/source', '/dest'));

        expect(fs.readFileSync('/source', 'utf8')).toBe('DATA');
        expect(fs.readFileSync('/dest', 'utf8')).toBe('TRY_TO_OVERWRITE_ME');
      });

      it('symbolic link -> directory', () => {
        fs.writeFileSync('/sourceReal', 'DATA');
        fs.symlinkSync('/sourceReal', '/source');
        fs.mkdirSync('/dest');

        expectFsError('EEXIST', () => fs.linkSync('/source', '/dest'));

        expect(fs.readFileSync('/source', 'utf8')).toBe('DATA');
        expect(fs.statSync('/dest').isDirectory()).toBe(true);
      });

      it('symbolic link -> symbolic link', () => {
        fs.writeFileSync('/sourceReal', 'DATA');
        fs.symlinkSync('/sourceReal', '/source');
        fs.writeFileSync('/destReal', 'TRY_TO_OVERWRITE_ME');
        fs.symlinkSync('/destReal', '/dest');

        expectFsError('EEXIST', () => fs.linkSync('/source', '/dest'));

        expect(fs.readFileSync('/source', 'utf8')).toBe('DATA');
        expect(fs.readlinkSync('/dest')).toBe('/destReal');
        expect(fs.readFileSync('/dest', 'utf8')).toBe('TRY_TO_OVERWRITE_ME');
      });

      it('symbolic link -> itself', () => {
        fs.writeFileSync('/sourceReal', 'DATA');
        fs.symlinkSync('/sourceReal', '/source');

        expectFsError('EEXIST', () => fs.linkSync('/source', '/source'));

        expect(fs.readFileSync('/source', 'utf8')).toBe('DATA');
        expect(fs.readlinkSync('/source')).toBe('/sourceReal');
      });
    });

    describe('errors when source is a directory', () => {
      it('directory -> file', () => {
        fs.mkdirSync('/source');
        fs.writeFileSync('/dest', 'TRY_TO_OVERWRITE_ME');

        expectFsError('EPERM', () => fs.linkSync('/source', '/dest'));
        expect(fs.statSync('/source').isDirectory()).toBe(true);
        expect(fs.readFileSync('/dest', 'utf8')).toBe('TRY_TO_OVERWRITE_ME');
      });

      it('directory -> symbolic link', () => {
        fs.mkdirSync('/source');
        fs.writeFileSync('/destReal', 'TRY_TO_OVERWRITE_ME');
        fs.symlinkSync('/destReal', '/dest');

        expectFsError('EPERM', () => fs.linkSync('/source', '/dest'));
        expect(fs.statSync('/source').isDirectory()).toBe(true);
        expect(fs.readFileSync('/dest', 'utf8')).toBe('TRY_TO_OVERWRITE_ME');
        expect(fs.readlinkSync('/dest')).toBe('/destReal');
      });

      it('directory -> empty directory', () => {
        fs.mkdirSync('/source');
        fs.writeFileSync('/source/data', 'DATA');
        fs.mkdirSync('/dest');

        expectFsError('EPERM', () => fs.linkSync('/source', '/dest'));
        expect(fs.readFileSync('/source/data', 'utf8')).toBe('DATA');
        expect(fs.existsSync('/dest/data')).toBe(false);
      });

      it('directory -> non-empty directory', () => {
        fs.mkdirSync('/source');
        fs.writeFileSync('/source/data', 'DATA');
        fs.mkdirSync('/dest');
        fs.writeFileSync('/dest/nope', 'TRY_TO_OVERWRITE_ME');

        expectFsError('EPERM', () => fs.linkSync('/source', '/dest'));
        expect(fs.readFileSync('/source/data', 'utf8')).toBe('DATA');
        expect(fs.readFileSync('/dest/nope', 'utf8')).toBe(
          'TRY_TO_OVERWRITE_ME',
        );
      });

      it('directory -> itself', () => {
        fs.mkdirSync('/source');
        fs.writeFileSync('/source/data', 'DATA');

        expectFsError('EPERM', () => fs.linkSync('/source', '/source'));
        expect(fs.readFileSync('/source/data', 'utf8')).toBe('DATA');
      });
    });
  });

  describe('truncateSync', () => {
    it('errors on truncating a directory', () => {
      fs.mkdirSync('/foo');

      expectFsError('EISDIR', () => fs.truncateSync('/foo'));
    });

    it('truncates an empty file', () => {
      fs.writeFileSync('/foo', Buffer.from([]));
      fs.truncateSync('/foo');
      expect(fs.readFileSync('/foo')).toEqual(Buffer.from([]));
    });

    it('truncates a non-empty file', () => {
      fs.writeFileSync('/foo', Buffer.from([42, 1337]));
      fs.truncateSync('/foo');
      expect(fs.readFileSync('/foo')).toEqual(Buffer.from([]));
    });

    it('zero pads an empty file to the specified length', () => {
      fs.writeFileSync('/foo', Buffer.from([]));
      fs.truncateSync('/foo', 3);
      expect(fs.readFileSync('/foo')).toEqual(Buffer.from([0, 0, 0]));
    });

    it('zero pads a non-empty file to the specified length', () => {
      fs.writeFileSync('/foo', Buffer.from([42]));
      fs.truncateSync('/foo', 3);
      expect(fs.readFileSync('/foo')).toEqual(Buffer.from([42, 0, 0]));
    });

    it('truncates a non-empty file to the specified length', () => {
      fs.writeFileSync('/foo', Buffer.from([0xfa, 0xce, 0xb0, 0x0c]));
      fs.truncateSync('/foo', 2);
      expect(fs.readFileSync('/foo')).toEqual(Buffer.from([0xfa, 0xce]));
    });

    it('truncates a non-empty file to its current length', () => {
      fs.writeFileSync('/foo', Buffer.from([42, 1337]));
      fs.truncateSync('/foo', 2);
      expect(fs.readFileSync('/foo')).toEqual(Buffer.from([42, 1337]));
    });

    it('explicitly specifying length 0 works', () => {
      fs.writeFileSync('/foo', Buffer.from([42, 1337]));
      fs.truncateSync('/foo', 0);
      expect(fs.readFileSync('/foo')).toEqual(Buffer.from([]));
    });

    describe('with file descriptor', () => {
      it('errors on truncating a a non-writable file', () => {
        fs.writeFileSync('/foo', '');
        const fd = fs.openSync('/foo', 'r');

        expectFsError('EBADF', () => fs.truncateSync(fd));

        fs.closeSync(fd);
      });

      it('errors on a nonexistent file descriptor', () => {
        expectFsError('EBADF', () => fs.truncateSync(42));
      });

      it('errors on a closed file descriptor', () => {
        fs.writeFileSync('/foo', 'DATA');
        const fd = fs.openSync('/foo', 'r');
        fs.closeSync(fd);
        expectFsError('EBADF', () => fs.truncateSync(fd));
        expect(fs.readFileSync('/foo', 'utf8')).toBe('DATA');
      });

      it('truncates a non-empty file to the specified length', () => {
        fs.writeFileSync('/foo', Buffer.from([0xfa, 0xce, 0xb0, 0x0c]));
        const fd = fs.openSync('/foo', 'r+');
        const buf = Buffer.alloc(100);

        fs.truncateSync(fd, 2);
        const bytesRead = fs.readSync(fd, buf, 0, buf.length, 0);
        expect(buf.slice(0, bytesRead)).toEqual(Buffer.from([0xfa, 0xce]));

        fs.closeSync(fd);
      });

      it('truncates without changing the current read position', () => {
        fs.writeFileSync('/foo', Buffer.from([1, 2, 3, 4, 5, 6, 7, 8]));
        const fd = fs.openSync('/foo', 'r+');
        const buf = Buffer.alloc(100);

        // Advance the position by 2
        fs.readSync(fd, buf, 0, 2);
        // Truncate to the first 4 bytes
        fs.truncateSync(fd, 4);
        // Read 2 bytes and reach the end
        const bytesRead = fs.readSync(fd, buf, 0, 6);
        expect(buf.slice(0, bytesRead)).toEqual(Buffer.from([3, 4]));

        fs.closeSync(fd);
      });

      it('truncates without changing the current write position', () => {
        fs.writeFileSync('/foo', Buffer.from([1, 2, 3, 4, 5, 6, 7, 8]));
        const fd = fs.openSync('/foo', 'r+');

        // Advance the position by 2
        fs.writeSync(fd, Buffer.from([10, 20]));
        // Truncate to the first 4 bytes
        fs.truncateSync(fd, 4);
        // Write 1 more byte
        fs.writeSync(fd, Buffer.from([30]));
        fs.closeSync(fd);

        expect(fs.readFileSync('/foo')).toEqual(Buffer.from([10, 20, 30, 4]));
      });
    });
  });

  describe('chmod', () => {
    describe('chmodSync', () => {
      it('sets the file mode', () => {
        fs.writeFileSync('/foo.txt', 'test', {mode: 0o700});
        expect(fs.statSync('/foo.txt').mode).toBe(0o700);
        fs.chmodSync('/foo.txt', 0o400);
        expect(fs.statSync('/foo.txt').mode).toBe(0o400);
      });

      it('parses strings as octal integers', () => {
        fs.writeFileSync('/foo.txt', 'test');
        fs.chmodSync('/foo.txt', '400');
        expect(fs.statSync('/foo.txt').mode).toBe(0o400);
      });

      it('follows symlinks', () => {
        fs.writeFileSync('/foo.txt', 'test');
        fs.symlinkSync('/foo.txt', '/link.txt');
        fs.chmodSync('/link.txt', '400');
        expect(fs.statSync('/foo.txt').mode).toBe(0o400);
        expect(fs.lstatSync('/link.txt').mode).not.toBe(0o400);
      });
    });

    describe('lchmodSync', () => {
      it('sets the file mode', () => {
        fs.writeFileSync('/foo.txt', 'test', {mode: 0o700});
        expect(fs.statSync('/foo.txt').mode).toBe(0o700);
        fs.lchmodSync('/foo.txt', 0o400);
        expect(fs.statSync('/foo.txt').mode).toBe(0o400);
      });

      it('parses strings as octal integers', () => {
        fs.writeFileSync('/foo.txt', 'test');
        fs.lchmodSync('/foo.txt', '400');
        expect(fs.statSync('/foo.txt').mode).toBe(0o400);
      });

      it('does not follow symlinks', () => {
        fs.writeFileSync('/foo.txt', 'test');
        fs.symlinkSync('/foo.txt', '/link.txt');
        fs.lchmodSync('/link.txt', '400');
        expect(fs.statSync('/foo.txt').mode).not.toBe(0o400);
        expect(fs.lstatSync('/link.txt').mode).toBe(0o400);
      });
    });

    describe('fchmodSync', () => {
      it('sets the file mode', () => {
        const fd = fs.openSync('/foo.txt', 'w', 0o700);
        expect(fs.fstatSync(fd).mode).toBe(0o700);
        fs.fchmodSync(fd, 0o400);
        expect(fs.fstatSync(fd).mode).toBe(0o400);
      });

      it('parses strings as octal integers', () => {
        const fd = fs.openSync('/foo.txt', 'w');
        fs.fchmodSync(fd, '400');
        expect(fs.fstatSync(fd).mode).toBe(0o400);
      });
    });
  });

  describe('mkdtemp', () => {
    it('creates a directory', () => {
      const name = fs.mkdtempSync('/');
      expect(fs.statSync(name).isDirectory()).toBe(true);
    });

    it('creates the directory with mode 0700', () => {
      const name = fs.mkdtempSync('/');
      expect(fs.statSync(name).mode).toBe(0o700);
    });

    it('concatenates a random suffix to the given prefix', () => {
      fs.mkdirSync('/tmp');
      const name = fs.mkdtempSync('/tmp/prefix');
      expect(path.posix.dirname(name)).toBe('/tmp');
      expect(path.posix.basename(name)).toMatch(/^prefix.{6}$/);
    });

    it('fails to create in a nonexistent directory', () => {
      expectFsError(
        'ENOENT',
        () => {
          fs.mkdtempSync('/doesnotexist/');
        },
        {
          // The message will contain a random part so we can't snapshot it.
          noSnapshot: true,
        },
      );
    });

    it('returns a different name every time', () => {
      const name1 = fs.mkdtempSync('/');
      const name2 = fs.mkdtempSync('/');
      expect(name2).not.toBe(name1);
    });

    it('returns the directory name interpreted in the requested encoding', () => {
      const nameHex = fs.mkdtempSync('/', {encoding: 'hex'});
      const name = Buffer.from(nameHex, 'hex').toString('utf8');
      expect(name).toMatch(/^\/.{6}$/);
      expect(fs.statSync(name).isDirectory()).toBe(true);
    });
  });
});

describe('win32 support', () => {
  beforeEach(() => {
    fs = new MemoryFs({platform: 'win32'});
  });

  it('can write then read a file', () => {
    fs.writeFileSync('C:\\foo.txt', 'test');
    expect(fs.readFileSync('C:\\foo.txt', 'utf8')).toEqual('test');
  });

  it('gives the real path for a file', () => {
    fs.writeFileSync('C:\\foo.txt', 'test');
    expect(fs.realpathSync('c:/foo.txt')).toEqual('c:\\foo.txt');
  });

  it('can write then read via a symlinked file', () => {
    fs.symlinkSync('foo.txt', 'c:\\bar.txt');
    fs.writeFileSync('c:\\bar.txt', 'test');
    expect(fs.readFileSync('c:\\bar.txt', 'utf8')).toEqual('test');
    expect(fs.readFileSync('c:\\foo.txt', 'utf8')).toEqual('test');
  });

  it('can write then read via an absolutely symlinked file', () => {
    fs.symlinkSync('c:\\foo.txt', 'c:\\bar.txt');
    fs.writeFileSync('c:\\bar.txt', 'test');
    expect(fs.readFileSync('c:\\bar.txt', 'utf8')).toEqual('test');
    expect(fs.readFileSync('c:\\foo.txt', 'utf8')).toEqual('test');
  });
});

describe('promises', () => {
  beforeEach(() => {
    fs = new MemoryFs({cwd: () => '/current/working/dir'});
  });

  it('exists', () => {
    expect(fs.promises).toBeDefined();
  });

  it('can write then read a file', async () => {
    await fs.promises.writeFile('/foo.txt', 'test');

    expect(await fs.promises.readFile('/foo.txt', 'utf8')).toEqual('test');
  });

  it('throws when trying to read inexistent file', async () => {
    await expect(fs.promises.readFile('/foo.txt')).rejects.toEqual(
      expect.objectContaining({code: 'ENOENT'}),
    );
  });
});

function expectFsError(
  code: string,
  handler: () => $FlowFixMe,
  {noSnapshot}: {noSnapshot?: boolean} = {...null},
) {
  try {
    handler();
    throw new Error('an error was expected but did not happen');
  } catch (error) {
    if (error.code !== code) {
      throw error;
    }
    if (!noSnapshot) {
      expect(error.message).toMatchSnapshot();
    }
    expect(typeof error.errno).toBe('number');
  }
}
