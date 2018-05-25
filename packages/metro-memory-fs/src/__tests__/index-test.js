/**
 * Copyright (c) 2016-present, Facebook, Inc.
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
        done(wrError);
        return;
      }
      fs.readFile('/foo.txt', 'utf8', (rdError, str) => {
        if (rdError) {
          done(rdError);
          return;
        }
        expect(str).toEqual('test');
        done();
      });
    });
  });

  it('can write then read a file as buffer', () => {
    fs.writeFileSync('/foo.txt', new Buffer([1, 2, 3, 4]));
    expect(fs.readFileSync('/foo.txt')).toEqual(new Buffer([1, 2, 3, 4]));
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
      const st = fs.createWriteStream('/foo.txt');
      let opened = false;
      let closed = false;
      st.on('open', () => (opened = true));
      st.on('close', () => (closed = true));
      st.write('test');
      st.write(' foo');
      st.end(() => {
        expect(opened).toBe(true);
        expect(closed).toBe(true);
        expect(fs.readFileSync('/foo.txt', 'utf8')).toEqual('test foo');
        done();
      });
    });

    it('writes a file, as buffer', done => {
      const st = fs.createWriteStream('/foo.txt');
      let opened = false;
      let closed = false;
      st.on('open', () => (opened = true));
      st.on('close', () => (closed = true));
      st.write(Buffer.from('test'));
      st.write(Buffer.from(' foo'));
      st.end(() => {
        expect(opened).toBe(true);
        expect(closed).toBe(true);
        expect(fs.readFileSync('/foo.txt', 'utf8')).toEqual('test foo');
        done();
      });
    });

    it('writes a file, with a starting position', done => {
      fs.writeFileSync('/foo.txt', 'test bar');
      const st = fs.createWriteStream('/foo.txt', {start: 5, flags: 'r+'});
      let opened = false;
      let closed = false;
      st.on('open', () => (opened = true));
      st.on('close', () => (closed = true));
      st.write('beep');
      st.end(() => {
        expect(opened).toBe(true);
        expect(closed).toBe(true);
        expect(fs.readFileSync('/foo.txt', 'utf8')).toEqual('test beep');
        done();
      });
    });

    it('writes a file with a custom fd', done => {
      const fd = fs.openSync('/bar.txt', 'w');
      const st = fs.createWriteStream('/foo.txt', {fd});
      let opened = false;
      let closed = false;
      st.on('open', () => (opened = true));
      st.on('close', () => (closed = true));
      st.write('beep boop');
      st.end(() => {
        expect(opened).toBe(false);
        expect(closed).toBe(true);
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

    function readWithReadStream(options, filePath = '/foo.txt') {
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
      let buffer = new Buffer(0);
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

  it('able to list files of a directory', () => {
    fs.mkdirSync('/baz');
    fs.writeFileSync('/baz/foo.txt', 'test');
    fs.writeFileSync('/baz/bar.txt', 'boop');
    fs.symlinkSync('glo', '/baz/glo.txt');
    expect(fs.readdirSync('/baz')).toEqual(['foo.txt', 'bar.txt', 'glo.txt']);
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

    function collectWatchEvents(entPath, options, events) {
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
    expectFsError('EBADF', () => fs.writeSync(42, new Buffer([1])));
  });

  it('throws when trying to write to a read-only file descriptor', () => {
    fs.writeFileSync('/foo.txt', 'test');
    const fd = fs.openSync('/foo.txt', 'r');
    expectFsError('EBADF', () => fs.writeSync(fd, new Buffer([1])));
  });

  it('throws when trying to open too many files', () => {
    fs.writeFileSync('/foo.txt', 'test');
    expectFsError('EMFILE', () => {
      for (let i = 0; i < 1000; ++i) {
        fs.openSync('/foo.txt', 'r');
      }
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

function expectFsError(code, handler) {
  try {
    handler();
    throw new Error('an error was expected but did not happen');
  } catch (error) {
    if (error.code !== code) {
      throw error;
    }
    expect(error.message).toMatchSnapshot();
    expect(typeof error.errno).toBe('number');
  }
}
