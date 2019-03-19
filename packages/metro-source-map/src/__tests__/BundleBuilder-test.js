/**
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @format
 * @emails oncall+js_foundation
 * @flow strict-local
 */

'use strict';
const {BundleBuilder} = require('../BundleBuilder');

let builder;
beforeEach(() => {
  builder = new BundleBuilder('bundle.js');
});

describe('BundleBuilder', () => {
  it('empty', () => {
    expect(builder.getCode()).toBe('');
    expect(builder.getMap()).toMatchInlineSnapshot(`
Object {
  "file": "bundle.js",
  "sections": Array [],
  "version": 3,
}
`);
  });

  it('single empty region', () => {
    builder.append('');
    expect(builder.getCode()).toBe('');
    expect(builder.getMap()).toMatchInlineSnapshot(`
Object {
  "file": "bundle.js",
  "sections": Array [],
  "version": 3,
}
`);
  });

  it('single unmapped region', () => {
    builder.append('abcdef');
    expect(builder.getCode()).toBe('abcdef');
    expect(builder.getMap()).toMatchInlineSnapshot(`
Object {
  "file": "bundle.js",
  "sections": Array [],
  "version": 3,
}
`);
  });

  it('single unmapped region ending in newline', () => {
    builder.append('abcdef\n');
    expect(builder.getCode()).toBe('abcdef\n');
    expect(builder.getMap()).toMatchInlineSnapshot(`
Object {
  "file": "bundle.js",
  "sections": Array [],
  "version": 3,
}
`);
  });

  it('two unmapped regions in one line', () => {
    builder.append('abc').append('def');
    expect(builder.getCode()).toBe('abcdef');
    expect(builder.getMap()).toMatchInlineSnapshot(`
Object {
  "file": "bundle.js",
  "sections": Array [],
  "version": 3,
}
`);
  });

  it('two mapped regions in one line', () => {
    builder
      .append('abc', {version: 3, mappings: 'A', names: [], sources: []})
      .append('def', {version: 3, mappings: 'A,C', names: [], sources: []});
    expect(builder.getCode()).toBe('abcdef');
    expect(builder.getMap()).toMatchInlineSnapshot(`
Object {
  "file": "bundle.js",
  "sections": Array [
    Object {
      "map": Object {
        "mappings": "A",
        "names": Array [],
        "sources": Array [],
        "version": 3,
      },
      "offset": Object {
        "column": 0,
        "line": 0,
      },
    },
    Object {
      "map": Object {
        "mappings": "A,C",
        "names": Array [],
        "sources": Array [],
        "version": 3,
      },
      "offset": Object {
        "column": 3,
        "line": 0,
      },
    },
  ],
  "version": 3,
}
`);
  });

  it('two mapped regions with newlines', () => {
    builder
      .append('abc\n', {
        version: 3,
        mappings: 'A',
        names: [],
        sources: [],
      })
      .append('def\n', {
        version: 3,
        mappings: 'A,C',
        names: [],
        sources: [],
      });
    expect(builder.getCode()).toBe('abc\ndef\n');
    expect(builder.getMap()).toMatchInlineSnapshot(`
Object {
  "file": "bundle.js",
  "sections": Array [
    Object {
      "map": Object {
        "mappings": "A",
        "names": Array [],
        "sources": Array [],
        "version": 3,
      },
      "offset": Object {
        "column": 0,
        "line": 0,
      },
    },
    Object {
      "map": Object {
        "mappings": "A,C",
        "names": Array [],
        "sources": Array [],
        "version": 3,
      },
      "offset": Object {
        "column": 0,
        "line": 1,
      },
    },
  ],
  "version": 3,
}
`);
  });

  it('unmapped columns before a mapped region', () => {
    builder.append('abc').append('def\n', {
      version: 3,
      mappings: 'A',
      names: [],
      sources: [],
    });
    expect(builder.getCode()).toBe('abcdef\n');
    expect(builder.getMap()).toMatchInlineSnapshot(`
Object {
  "file": "bundle.js",
  "sections": Array [
    Object {
      "map": Object {
        "mappings": "A",
        "names": Array [],
        "sources": Array [],
        "version": 3,
      },
      "offset": Object {
        "column": 3,
        "line": 0,
      },
    },
  ],
  "version": 3,
}
`);
  });

  it('CR newlines', () => {
    builder.append('\r\r').append('abc', {
      version: 3,
      mappings: 'A',
      names: [],
      sources: [],
    });
    expect(builder.getCode()).toBe('\r\rabc');
    expect(builder.getMap()).toMatchInlineSnapshot(`
Object {
  "file": "bundle.js",
  "sections": Array [
    Object {
      "map": Object {
        "mappings": "A",
        "names": Array [],
        "sources": Array [],
        "version": 3,
      },
      "offset": Object {
        "column": 0,
        "line": 2,
      },
    },
  ],
  "version": 3,
}
`);
  });

  it('LF newlines', () => {
    builder.append('\n\n').append('abc', {
      version: 3,
      mappings: 'A',
      names: [],
      sources: [],
    });
    expect(builder.getCode()).toBe('\n\nabc');
    expect(builder.getMap()).toMatchInlineSnapshot(`
Object {
  "file": "bundle.js",
  "sections": Array [
    Object {
      "map": Object {
        "mappings": "A",
        "names": Array [],
        "sources": Array [],
        "version": 3,
      },
      "offset": Object {
        "column": 0,
        "line": 2,
      },
    },
  ],
  "version": 3,
}
`);
  });

  it('CRLF newlines', () => {
    builder.append('\r\n\r\n').append('abc', {
      version: 3,
      mappings: 'A',
      names: [],
      sources: [],
    });
    expect(builder.getCode()).toBe('\r\n\r\nabc');
    expect(builder.getMap()).toMatchInlineSnapshot(`
Object {
  "file": "bundle.js",
  "sections": Array [
    Object {
      "map": Object {
        "mappings": "A",
        "names": Array [],
        "sources": Array [],
        "version": 3,
      },
      "offset": Object {
        "column": 0,
        "line": 2,
      },
    },
  ],
  "version": 3,
}
`);
  });

  it('mapped, unmapped, mapped', () => {
    builder
      .append('abc\n', {
        version: 3,
        mappings: 'A',
        names: [],
        sources: [],
      })
      .append('def\n')
      .append('ghi\n', {
        version: 3,
        mappings: 'A,C',
        names: [],
        sources: [],
      });
    expect(builder.getCode()).toBe('abc\ndef\nghi\n');
    expect(builder.getMap()).toMatchInlineSnapshot(`
Object {
  "file": "bundle.js",
  "sections": Array [
    Object {
      "map": Object {
        "mappings": "A",
        "names": Array [],
        "sources": Array [],
        "version": 3,
      },
      "offset": Object {
        "column": 0,
        "line": 0,
      },
    },
    Object {
      "map": Object {
        "mappings": "A,C",
        "names": Array [],
        "sources": Array [],
        "version": 3,
      },
      "offset": Object {
        "column": 0,
        "line": 2,
      },
    },
  ],
  "version": 3,
}
`);
  });

  it('mapped, unmapped, partially mapped', () => {
    builder
      .append('abc\n', {
        version: 3,
        mappings: 'A',
        names: [],
        sources: [],
      })
      .append('def\n')
      .append('ghi\n', {
        version: 3,
        mappings: 'C', // The first character of this region is unmapped!
        names: [],
        sources: [],
      });
    expect(builder.getCode()).toBe('abc\ndef\nghi\n');
    expect(builder.getMap()).toMatchInlineSnapshot(`
Object {
  "file": "bundle.js",
  "sections": Array [
    Object {
      "map": Object {
        "mappings": "A",
        "names": Array [],
        "sources": Array [],
        "version": 3,
      },
      "offset": Object {
        "column": 0,
        "line": 0,
      },
    },
    Object {
      "map": Object {
        "mappings": "C",
        "names": Array [],
        "sources": Array [],
        "version": 3,
      },
      "offset": Object {
        "column": 0,
        "line": 2,
      },
    },
  ],
  "version": 3,
}
`);
  });
});
