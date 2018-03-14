/**
 * Copyright (c) 2015-present, Facebook, Inc.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow
 * @format
 */

'use strict';

// $FlowFixMe: not defined by Flow
const constants = require('constants');
const path = require('path');
const stream = require('stream');

type NodeBase = {|
  id: number,
|};

type DirectoryNode = {|
  ...NodeBase,
  type: 'directory',
  entries: Map<string, EntityNode>,
|};

type FileNode = {|
  ...NodeBase,
  type: 'file',
  content: Buffer,
|};

type SymbolicLinkNode = {|
  ...NodeBase,
  type: 'symbolicLink',
  target: string,
|};

type EntityNode = DirectoryNode | FileNode | SymbolicLinkNode;

type Encoding =
  | 'ascii'
  | 'base64'
  | 'binary'
  | 'hex'
  | 'latin1'
  | 'ucs2'
  | 'utf16le'
  | 'utf8';

type Resolution = {|
  +basename: string,
  +dirNode: DirectoryNode,
  +node: ?EntityNode,
  +realpath: string,
|};

type Descriptor = {|
  +node: FileNode,
  +readable: boolean,
  +writable: boolean,
  position: number,
|};

const FLAGS_SPECS: {
  [string]: {
    exclusive?: true,
    mustExist?: true,
    readable?: true,
    truncate?: true,
    writable?: true,
  },
} = {
  r: {mustExist: true, readable: true},
  'r+': {mustExist: true, readable: true, writable: true},
  'rs+': {mustExist: true, readable: true, writable: true},
  w: {truncate: true, writable: true},
  wx: {exclusive: true, truncate: true, writable: true},
  'w+': {readable: true, truncate: true, writable: true},
  'wx+': {exclusive: true, readable: true, truncate: true, writable: true},
};

const ASYNC_FUNC_NAMES = [
  'close',
  'open',
  'read',
  'readdir',
  'readFile',
  'realpath',
  'stat',
  'write',
  'writeFile',
];

/**
 * Simulates `fs` API in an isolated, memory-based filesystem. This is useful
 * for testing systems that rely on `fs` without affecting the real filesystem.
 * This is meant to be a drop-in replacement/mock for `fs`, so it mimics
 * closely the behavior of file path resolution and file accesses.
 */
class MemoryFs {
  _root: DirectoryNode;
  _fds: Map<number, Descriptor>;
  _nextId: number;

  close: (fd: number, callback: (error: ?Error) => mixed) => void;
  open: (
    filePath: string | Buffer,
    flag: string | number,
    mode?: number,
    callback: (error: ?Error, fd: ?number) => mixed,
  ) => void;
  read: (
    fd: number,
    buffer: Buffer,
    offset: number,
    length: number,
    position: ?number,
    callback: (?Error, ?number) => mixed,
  ) => void;
  readFile: (
    filePath: string | Buffer,
    options?:
      | {
          encoding?: Encoding,
          flag?: string,
        }
      | Encoding
      | ((?Error, ?Buffer | string) => mixed),
    callback?: (?Error, ?Buffer | string) => mixed,
  ) => void;
  realpath: (
    filePath: string | Buffer,
    callback: (?Error, ?string) => mixed,
  ) => void;
  write: (
    fd: number,
    bufferOrString: Buffer | string,
    offsetOrPosition?: number | ((?Error, number) => mixed),
    lengthOrEncoding?: number | string | ((?Error, number) => mixed),
    position?: number | ((?Error, number) => mixed),
    callback?: (?Error, number) => mixed,
  ) => void;
  writeFile: (
    filePath: string | Buffer,
    data: Buffer | string,
    options?:
      | {
          encoding?: ?Encoding,
          mode?: ?number,
          flag?: ?string,
        }
      | Encoding
      | ((?Error) => mixed),
    callback?: (?Error) => mixed,
  ) => void;

  constructor() {
    this.reset();
    ASYNC_FUNC_NAMES.forEach(funcName => {
      const func = (this: $FlowFixMe)[`${funcName}Sync`];
      (this: $FlowFixMe)[funcName] = function(...args) {
        const callback = args.pop();
        process.nextTick(() => {
          let retval;
          try {
            retval = func.apply(null, args);
          } catch (error) {
            callback(error);
            return;
          }
          callback(null, retval);
        });
      };
    });
  }

  reset() {
    this._nextId = 1;
    this._root = this._makeDir();
    this._fds = new Map();
  }

  closeSync = (fd: number): void => {
    this._fds.delete(fd);
  };

  openSync = (
    filePath: string | Buffer,
    flags: string | number,
    mode?: number,
  ): number => {
    if (typeof flags === 'number') {
      throw new Error(`numeric flags not supported: ${flags}`);
    }
    return this._open(pathStr(filePath), flags, mode);
  };

  readSync = (
    fd: number,
    buffer: Buffer,
    offset: number,
    length: number,
    position: ?number,
  ): number => {
    const desc = this._fds.get(fd);
    if (desc == null) {
      throw makeError('EBADF', null, 'file descriptor is not open');
    }
    if (!desc.readable) {
      throw makeError('EBADF', null, 'file descriptor cannot be written to');
    }
    if (position != null) {
      desc.position = position;
    }
    const endPos = Math.min(desc.position + length, desc.node.content.length);
    desc.node.content.copy(buffer, offset, desc.position, endPos);
    const bytesRead = endPos - desc.position;
    desc.position = endPos;
    return bytesRead;
  };

  readdirSync = (
    filePath: string | Buffer,
    options?:
      | {
          encoding?: Encoding,
        }
      | Encoding,
  ): Array<string | Buffer> => {
    let encoding;
    if (typeof options === 'string') {
      encoding = options;
    } else if (options != null) {
      ({encoding} = options);
    }
    filePath = pathStr(filePath);
    const {node} = this._resolve(filePath);
    if (node == null) {
      throw makeError('ENOENT', filePath, 'no such file or directory');
    }
    if (node.type !== 'directory') {
      throw makeError('ENOTDIR', filePath, 'not a directory');
    }
    return Array.from(node.entries.keys()).map(str => {
      if (encoding === 'utf8') {
        return str;
      }
      const buffer = Buffer.from(str);
      if (encoding === 'buffer') {
        return buffer;
      }
      return buffer.toString(encoding);
    });
  };

  readFileSync = (
    filePath: string | Buffer,
    options?:
      | {
          encoding?: Encoding,
          flag?: string,
        }
      | Encoding,
  ): Buffer | string => {
    let encoding, flag;
    if (typeof options === 'string') {
      encoding = options;
    } else if (options != null) {
      ({encoding, flag} = options);
    }
    const fd = this._open(pathStr(filePath), flag || 'r');
    const chunks = [];
    try {
      const buffer = new Buffer(1024);
      let bytesRead;
      do {
        bytesRead = this.readSync(fd, buffer, 0, buffer.length, null);
        if (bytesRead === 0) {
          continue;
        }
        const chunk = new Buffer(bytesRead);
        buffer.copy(chunk, 0, 0, bytesRead);
        chunks.push(chunk);
      } while (bytesRead > 0);
    } finally {
      this.closeSync(fd);
    }
    const result = Buffer.concat(chunks);
    if (encoding == null) {
      return result;
    }
    return result.toString(encoding);
  };

  realpathSync = (filePath: string | Buffer): string => {
    return this._resolve(pathStr(filePath)).realpath;
  };

  writeSync = (
    fd: number,
    bufferOrString: Buffer | string,
    offsetOrPosition?: number,
    lengthOrEncoding?: number | string,
    position?: number,
  ): number => {
    let encoding, offset, length, buffer;
    if (typeof bufferOrString === 'string') {
      position = offsetOrPosition;
      encoding = lengthOrEncoding;
      buffer = (Buffer: $FlowFixMe).from(
        bufferOrString,
        (encoding: $FlowFixMe) || 'utf8',
      );
    } else {
      offset = offsetOrPosition;
      if (lengthOrEncoding != null && typeof lengthOrEncoding !== 'number') {
        throw new Error('invalid length');
      }
      length = lengthOrEncoding;
      buffer = bufferOrString;
    }
    if (offset == null) {
      offset = 0;
    }
    if (length == null) {
      length = buffer.length;
    }
    return this._write(fd, buffer, offset, length, position);
  };

  writeFileSync = (
    filePath: string | Buffer,
    data: Buffer | string,
    options?:
      | {
          encoding?: ?Encoding,
          mode?: ?number,
          flag?: ?string,
        }
      | Encoding,
  ): void => {
    let encoding, mode, flag;
    if (typeof options === 'string') {
      encoding = options;
    } else if (options != null) {
      ({encoding, mode, flag} = options);
    }
    if (encoding == null) {
      encoding = 'utf8';
    }
    if (typeof data === 'string') {
      data = (Buffer: $FlowFixMe).from(data, encoding);
    }
    const fd = this._open(pathStr(filePath), flag || 'w', mode);
    try {
      this._write(fd, data, 0, data.length);
    } finally {
      this.closeSync(fd);
    }
  };

  mkdirSync = (dirPath: string | Buffer, mode?: number): void => {
    if (mode == null) {
      mode = 0o777;
    }
    dirPath = pathStr(dirPath);
    const {dirNode, node, basename} = this._resolve(dirPath);
    if (node != null) {
      throw makeError('EEXIST', dirPath, 'directory or file already exists');
    }
    dirNode.entries.set(basename, this._makeDir());
  };

  symlinkSync = (
    target: string | Buffer,
    filePath: string | Buffer,
    type?: string,
  ) => {
    if (type == null) {
      type = 'file';
    }
    if (type !== 'file') {
      throw new Error('symlink type not supported');
    }
    filePath = pathStr(filePath);
    const {dirNode, node, basename} = this._resolve(filePath);
    if (node != null) {
      throw makeError('EEXIST', filePath, 'directory or file already exists');
    }
    dirNode.entries.set(basename, {
      type: 'symbolicLink',
      id: this._getId(),
      target: pathStr(target),
    });
  };

  existsSync = (filePath: string | Buffer): boolean => {
    try {
      const {node} = this._resolve(pathStr(filePath));
      return node != null;
    } catch (error) {
      if (error.code === 'ENOENT') {
        return false;
      }
      throw error;
    }
  };

  statSync = (filePath: string | Buffer) => {
    filePath = pathStr(filePath);
    const {node} = this._resolve(filePath);
    if (node == null) {
      throw makeError('ENOENT', filePath, 'no such file or directory');
    }
    return new Stats(node);
  };

  createReadStream = (
    filePath: string | Buffer,
    options?:
      | {
          autoClose?: ?boolean,
          encoding?: ?Encoding,
          end?: ?number,
          fd?: ?number,
          flags?: ?string,
          highWaterMark?: ?number,
          mode?: ?number,
          start?: ?number,
        }
      | Encoding,
  ) => {
    let autoClose, encoding, fd, flags, mode, start, end, highWaterMark;
    if (typeof options === 'string') {
      encoding = options;
    } else if (options != null) {
      ({autoClose, encoding, fd, flags, mode, start} = options);
      ({end, highWaterMark} = options);
    }
    let st = null;
    if (fd == null) {
      fd = this._open(pathStr(filePath), flags || 'r', mode);
      process.nextTick(() => (st: any).emit('open', fd));
    }
    const ffd = fd;
    const {readSync} = this;
    const ropt = {filePath, encoding, fd, highWaterMark, start, end, readSync};
    const rst = new ReadFileSteam(ropt);
    st = rst;
    if (autoClose !== false) {
      const doClose = () => {
        this.closeSync(ffd);
        rst.emit('close');
      };
      rst.on('end', doClose);
      rst.on('error', doClose);
    }
    return rst;
  };

  createWriteStream = (
    filePath: string | Buffer,
    options?:
      | {
          autoClose?: ?boolean,
          encoding?: ?Encoding,
          fd?: ?number,
          flags?: ?string,
          mode?: ?number,
          start?: ?number,
        }
      | Encoding,
  ) => {
    let autoClose, fd, flags, mode, start;
    if (typeof options !== 'string' && options != null) {
      ({autoClose, fd, flags, mode, start} = options);
    }
    let st = null;
    if (fd == null) {
      fd = this._open(pathStr(filePath), flags || 'w', mode);
      process.nextTick(() => (st: any).emit('open', fd));
    }
    const ffd = fd;
    const ropt = {fd, writeSync: this._write.bind(this), filePath, start};
    const rst = new WriteFileStream(ropt);
    st = rst;
    if (autoClose !== false) {
      const doClose = () => {
        this.closeSync(ffd);
        rst.emit('close');
      };
      rst.on('finish', doClose);
      rst.on('error', doClose);
    }
    return st;
  };

  _makeDir() {
    return {type: 'directory', id: this._getId(), entries: new Map()};
  }

  _getId() {
    return ++this._nextId;
  }

  _open(filePath: string, flags: string, mode: ?number): number {
    if (mode == null) {
      mode = 0o666;
    }
    const spec = FLAGS_SPECS[flags];
    if (spec == null) {
      throw new Error(`flags not supported: \`${flags}\``);
    }
    const {writable = false, readable = false} = spec;
    const {exclusive, mustExist, truncate} = spec;
    let {dirNode, node, basename} = this._resolve(filePath);
    if (node == null) {
      if (mustExist) {
        throw makeError('ENOENT', filePath, 'no such file or directory');
      }
      node = {type: 'file', id: this._getId(), content: new Buffer(0)};
      dirNode.entries.set(basename, node);
    } else {
      if (exclusive) {
        throw makeError('EEXIST', filePath, 'directory or file already exists');
      }
      if (node.type !== 'file') {
        throw makeError('EISDIR', filePath, 'cannot read/write to a directory');
      }
      if (truncate) {
        node.content = new Buffer(0);
      }
    }
    return this._getFd(filePath, {node, position: 0, writable, readable});
  }

  /**
   * Implemented according with
   * http://man7.org/linux/man-pages/man7/path_resolution.7.html
   */
  _resolve(originalFilePath: string): Resolution {
    let filePath = originalFilePath;
    let drive = '';
    if (path === path.win32 && filePath.match(/^[a-zA-Z]:\\/)) {
      drive = filePath.substring(0, 2);
      filePath = filePath.substring(2);
    }
    if (filePath === '') {
      throw makeError('ENOENT', originalFilePath, 'no such file or directory');
    }
    if (filePath[0] === '/') {
      filePath = filePath.substring(1);
    } else {
      filePath = path.join(process.cwd().substring(1), filePath);
    }
    const entNames = filePath.split(path.sep);
    checkPathLength(entNames, originalFilePath);
    const context = {
      node: this._root,
      nodePath: [['', this._root]],
      entNames,
      symlinkCount: 0,
    };
    while (context.entNames.length > 0) {
      const entName = context.entNames.shift();
      this._resolveEnt(context, originalFilePath, entName);
    }
    const {nodePath} = context;
    return {
      realpath: drive + nodePath.map(x => x[0]).join(path.sep),
      dirNode: (nodePath[nodePath.length - 2][1]: $FlowFixMe),
      node: context.node,
      basename: (nodePath[nodePath.length - 1][0]: $FlowFixMe),
    };
  }

  _resolveEnt(context, filePath, entName) {
    const {node} = context;
    if (node == null) {
      throw makeError('ENOENT', filePath, 'no such file or directory');
    }
    if (node.type !== 'directory') {
      throw makeError('ENOTDIR', filePath, 'not a directory');
    }
    const {entries} = node;
    if (entName === '' || entName === '.') {
      return;
    }
    if (entName === '..') {
      const {nodePath} = context;
      if (nodePath.length > 1) {
        nodePath.pop();
        context.node = nodePath[nodePath.length - 1][1];
      }
      return;
    }
    const childNode = entries.get(entName);
    if (childNode == null || childNode.type !== 'symbolicLink') {
      context.node = childNode;
      context.nodePath.push([entName, childNode]);
      return;
    }
    if (context.symlinkCount >= 10) {
      throw makeError('ELOOP', filePath, 'too many levels of symbolic links');
    }
    let {target} = childNode;
    if (target[0] === '/') {
      target = target.substring(1);
      context.node = this._root;
      context.nodePath = [['', context.node]];
    }
    context.entNames = target.split(path.sep).concat(context.entNames);
    checkPathLength(context.entNames, filePath);
    ++context.symlinkCount;
  }

  _write(
    fd: number,
    buffer: Buffer,
    offset: number,
    length: number,
    position: ?number,
  ): number {
    const desc = this._fds.get(fd);
    if (desc == null) {
      throw makeError('EBADF', null, 'file descriptor is not open');
    }
    if (!desc.writable) {
      throw makeError('EBADF', null, 'file descriptor cannot be written to');
    }
    if (position == null) {
      position = desc.position;
    }
    const {node} = desc;
    if (node.content.length < position + length) {
      const newBuffer = new Buffer(position + length);
      node.content.copy(newBuffer, 0, 0, node.content.length);
      node.content = newBuffer;
    }
    buffer.copy(node.content, position, offset, offset + length);
    desc.position = position + length;
    return buffer.length;
  }

  _getFd(filePath: string, desc: Descriptor): number {
    let fd = 3;
    while (this._fds.has(fd)) {
      ++fd;
    }
    if (fd >= 256) {
      throw makeError('EMFILE', filePath, 'too many open files');
    }
    this._fds.set(fd, desc);
    return fd;
  }
}

class Stats {
  _type: string;
  dev: number;
  mode: number;
  nlink: number;
  uid: number;
  gid: number;
  rdev: number;
  blksize: number;
  ino: number;
  size: number;
  blocks: number;
  atimeMs: number;
  mtimeMs: number;
  ctimeMs: number;
  birthtimeMs: number;
  atime: Date;
  mtime: Date;
  ctime: Date;
  birthtime: Date;

  /**
   * Don't keep a reference to the node as it may get mutated over time.
   */
  constructor(node: EntityNode) {
    this._type = node.type;
    this.dev = 1;
    this.mode = 0;
    this.nlink = 1;
    this.uid = 100;
    this.gid = 100;
    this.rdev = 0;
    this.blksize = 1024;
    this.ino = node.id;
    this.size =
      node.type === 'file'
        ? node.content.length
        : node.type === 'symbolicLink' ? node.target.length : 0;
    this.blocks = Math.ceil(this.size / 512);
    this.atimeMs = 1;
    this.mtimeMs = 1;
    this.ctimeMs = 1;
    this.birthtimeMs = 1;
    this.atime = new Date(this.atimeMs);
    this.mtime = new Date(this.mtimeMs);
    this.ctime = new Date(this.ctimeMs);
    this.birthtime = new Date(this.birthtimeMs);
  }

  isFile(): boolean {
    return this._type === 'file';
  }
  isDirectory(): boolean {
    return this._type === 'directory';
  }
  isBlockDevice(): boolean {
    return false;
  }
  isCharacterDevice(): boolean {
    return false;
  }
  isSymbolicLink(): boolean {
    return this._type === 'symbolicLink';
  }
  isFIFO(): boolean {
    return false;
  }
  isSocket(): boolean {
    return false;
  }
}

type ReadSync = (
  fd: number,
  buffer: Buffer,
  offset: number,
  length: number,
  position: ?number,
) => number;

class ReadFileSteam extends stream.Readable {
  _buffer: Buffer;
  _fd: number;
  _positions: ?{current: number, last: number};
  _readSync: ReadSync;
  bytesRead: number;
  path: string | Buffer;

  constructor(options: {
    filePath: string | Buffer,
    encoding: ?Encoding,
    end: ?number,
    fd: number,
    highWaterMark: ?number,
    readSync: ReadSync,
    start: ?number,
  }) {
    const {highWaterMark, fd} = options;
    // eslint-disable-next-line lint/flow-no-fixme
    // $FlowFixMe: Readable does accept null of undefined for that value.
    super({highWaterMark});
    this.bytesRead = 0;
    this.path = options.filePath;
    this._readSync = options.readSync;
    this._fd = fd;
    this._buffer = new Buffer(1024);
    const {start, end} = options;
    if (start != null) {
      this._readSync(fd, new Buffer(0), 0, 0, start);
    }
    if (end != null) {
      this._positions = {current: start || 0, last: end + 1};
    }
  }

  _read(size) {
    let bytesRead;
    const {_buffer} = this;
    do {
      const length = this._getLengthToRead();
      const position = this._positions && this._positions.current;
      bytesRead = this._readSync(this._fd, _buffer, 0, length, position);
      if (this._positions != null) {
        this._positions.current += bytesRead;
      }
      this.bytesRead += bytesRead;
    } while (this.push(bytesRead > 0 ? _buffer.slice(0, bytesRead) : null));
  }

  _getLengthToRead() {
    const {_positions, _buffer} = this;
    if (_positions == null) {
      return _buffer.length;
    }
    const leftToRead = Math.max(0, _positions.last - _positions.current);
    return Math.min(_buffer.length, leftToRead);
  }
}

type WriteSync = (
  fd: number,
  buffer: Buffer,
  offset: number,
  length: number,
  position?: number,
) => number;

class WriteFileStream extends stream.Writable {
  bytesWritten: number;
  path: string | Buffer;
  _fd: number;
  _writeSync: WriteSync;

  constructor(opts: {
    fd: number,
    filePath: string | Buffer,
    writeSync: WriteSync,
    start: ?number,
  }) {
    super();
    this.path = opts.filePath;
    this.bytesWritten = 0;
    this._fd = opts.fd;
    this._writeSync = opts.writeSync;
    if (opts.start != null) {
      this._writeSync(opts.fd, new Buffer(0), 0, 0, opts.start);
    }
  }

  _write(buffer, encoding, callback) {
    try {
      const bytesWritten = this._writeSync(this._fd, buffer, 0, buffer.length);
      this.bytesWritten += bytesWritten;
    } catch (error) {
      callback(error);
      return;
    }
    callback();
  }
}

function checkPathLength(entNames, filePath) {
  if (entNames.length > 32) {
    throw makeError(
      'ENAMETOOLONG',
      filePath,
      'file path too long (or one of the intermediate ' +
        'symbolic link resolutions)',
    );
  }
}

function pathStr(filePath: string | Buffer): string {
  if (typeof filePath === 'string') {
    return filePath;
  }
  return filePath.toString('utf8');
}

function makeError(code, filePath, message) {
  const err: $FlowFixMe = new Error(
    filePath != null
      ? `${code}: \`${filePath}\`: ${message}`
      : `${code}: ${message}`,
  );
  err.code = code;
  err.errno = constants[code];
  err.path = filePath;
  return err;
}

module.exports = MemoryFs;
