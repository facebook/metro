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

jest.useRealTimers();

const MemoryFs = require('../index');

let fs;

beforeEach(() => {
  fs = new MemoryFs();
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

it('gives stat about a regular file', () => {
  fs.writeFileSync('/foo.txt', 'test');
  const st = fs.statSync('/foo.txt');
  expect(st.isFile()).toBe(true);
  expect(st.isDirectory()).toBe(false);
  expect(st.isSymbolicLink()).toBe(false);
  expect(st.size).toBe(4);
});

it('able to list files of a directory', () => {
  fs.mkdirSync('/baz');
  fs.writeFileSync('/baz/foo.txt', 'test');
  fs.writeFileSync('/baz/bar.txt', 'boop');
  fs.symlinkSync('glo', '/baz/glo.txt');
  expect(fs.readdirSync('/baz')).toEqual(['foo.txt', 'bar.txt', 'glo.txt']);
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
