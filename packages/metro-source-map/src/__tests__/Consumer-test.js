/**
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @format
 * @emails oncall+js_symbolication
 * @flow strict-local
 */

'use strict';

const Consumer = require('../Consumer');

const {add1, add0} = require('ob1');

const {objectContaining} = expect;

describe('basic maps', () => {
  describe('originalPositionFor', () => {
    test('empty map', () => {
      const consumer = new Consumer({
        version: 3,
        mappings: '',
        names: [],
        sources: [],
      });
      expect(consumer.originalPositionFor({line: add1(0), column: add0(0)}))
        .toMatchInlineSnapshot(`
        Object {
          "column": null,
          "line": null,
          "name": null,
          "source": null,
        }
      `);
    });

    test('single full mapping', () => {
      const consumer = new Consumer({
        version: 3,
        mappings: 'AAAAA',
        names: ['name0'],
        sources: ['source0'],
      });
      expect(consumer.originalPositionFor({line: add1(0), column: add0(0)}))
        .toMatchInlineSnapshot(`
        Object {
          "column": 0,
          "line": 1,
          "name": "name0",
          "source": "source0",
        }
      `);
      expect(consumer.originalPositionFor({line: add1(0), column: add0(10)}))
        .toMatchInlineSnapshot(`
        Object {
          "column": 0,
          "line": 1,
          "name": "name0",
          "source": "source0",
        }
      `);
      expect(consumer.originalPositionFor({line: add1(1), column: add0(0)}))
        .toMatchInlineSnapshot(`
        Object {
          "column": null,
          "line": null,
          "name": null,
          "source": null,
        }
      `);
    });

    test('multiple lines', () => {
      const consumer = new Consumer({
        version: 3,
        mappings: 'AAAAA;CAAC;EAAEC',
        names: ['name0', 'name1'],
        sources: ['source0'],
      });

      expect(consumer.originalPositionFor({line: add1(0), column: add0(0)}))
        .toMatchInlineSnapshot(`
        Object {
          "column": 0,
          "line": 1,
          "name": "name0",
          "source": "source0",
        }
      `);
      expect(consumer.originalPositionFor({line: add1(1), column: add0(1)}))
        .toMatchInlineSnapshot(`
        Object {
          "column": 1,
          "line": 1,
          "name": null,
          "source": "source0",
        }
      `);
      expect(consumer.originalPositionFor({line: add1(2), column: add0(2)}))
        .toMatchInlineSnapshot(`
        Object {
          "column": 3,
          "line": 1,
          "name": "name1",
          "source": "source0",
        }
      `);
    });
  });

  describe('generatedMappings()', () => {
    test('single full mapping', () => {
      expect([
        ...new Consumer({
          version: 3,
          mappings: 'AAAAA',
          names: ['name0'],
          sources: ['source0'],
        }).generatedMappings(),
      ]).toMatchInlineSnapshot(`
        Array [
          Object {
            "generatedColumn": 0,
            "generatedLine": 1,
            "name": "name0",
            "originalColumn": 0,
            "originalLine": 1,
            "source": "source0",
          },
        ]
      `);
    });

    test('mapping with only generatedColumn', () => {
      expect([
        ...new Consumer({
          version: 3,
          mappings: 'A',
          names: ['name0'],
          sources: ['source0'],
        }).generatedMappings(),
      ]).toMatchInlineSnapshot(`
        Array [
          Object {
            "generatedColumn": 0,
            "generatedLine": 1,
            "name": null,
            "originalColumn": null,
            "originalLine": null,
            "source": null,
          },
        ]
      `);
    });

    test('multiple lines', () => {
      expect([
        ...new Consumer({
          version: 3,
          mappings: 'AAAAA;CAAC;EAAEC',
          names: ['name0', 'name1'],
          sources: ['source0'],
        }).generatedMappings(),
      ]).toMatchInlineSnapshot(`
        Array [
          Object {
            "generatedColumn": 0,
            "generatedLine": 1,
            "name": "name0",
            "originalColumn": 0,
            "originalLine": 1,
            "source": "source0",
          },
          Object {
            "generatedColumn": 1,
            "generatedLine": 2,
            "name": null,
            "originalColumn": 1,
            "originalLine": 1,
            "source": "source0",
          },
          Object {
            "generatedColumn": 2,
            "generatedLine": 3,
            "name": "name1",
            "originalColumn": 3,
            "originalLine": 1,
            "source": "source0",
          },
        ]
      `);
    });
  });

  describe('sourceContentFor', () => {
    test('missing sourcesContent', () => {
      const consumer = new Consumer({
        version: 3,
        mappings: '',
        names: [],
        sources: [],
      });
      expect(consumer.sourceContentFor('a.js', true)).toBeNull();
    });

    test('null in sourcesContent', () => {
      const consumer = new Consumer({
        version: 3,
        mappings: '',
        names: [],
        sources: ['a.js'],
        sourcesContent: [null],
      });
      expect(consumer.sourceContentFor('a.js', true)).toBeNull();
    });

    test('sourcesContent too short', () => {
      const consumer = new Consumer({
        version: 3,
        mappings: '',
        names: [],
        sources: ['a.js'],
        sourcesContent: [],
      });
      expect(consumer.sourceContentFor('a.js', true)).toBeNull();
    });

    test('string in sourcesContent', () => {
      const consumer = new Consumer({
        version: 3,
        mappings: '',
        names: [],
        sources: ['a.js'],
        sourcesContent: ['content of a.js'],
      });
      expect(consumer.sourceContentFor('a.js', true)).toBe('content of a.js');
    });
  });
});

describe('indexed (sectioned) maps', () => {
  describe('originalPositionFor', () => {
    test('empty map', () => {
      const consumer = new Consumer({
        version: 3,
        sections: [],
      });
      expect(consumer.originalPositionFor({line: add1(0), column: add0(0)}))
        .toMatchInlineSnapshot(`
        Object {
          "column": null,
          "line": null,
          "name": null,
          "source": null,
        }
      `);
    });

    test('section per column', () => {
      const consumer = new Consumer({
        version: 3,
        sections: [
          {
            offset: {line: 0, column: 0},
            map: {
              version: 3,
              names: ['section0_name0'],
              sources: ['section0_source0'],
              mappings: 'AAEEA',
            },
          },
          {
            offset: {line: 0, column: 1},
            map: {
              version: 3,
              names: ['section1_name0'],
              sources: ['section1_source0'],
              mappings: 'AAEEA',
            },
          },
          {
            offset: {line: 0, column: 2},
            map: {
              version: 3,
              names: ['section2_name0'],
              sources: ['section2_source0'],
              mappings: 'AAEEA',
            },
          },
        ],
      });
      expect(consumer.originalPositionFor({line: add1(0), column: add0(0)}))
        .toMatchInlineSnapshot(`
        Object {
          "column": 2,
          "line": 3,
          "name": "section0_name0",
          "source": "section0_source0",
        }
      `);
      expect(consumer.originalPositionFor({line: add1(0), column: add0(1)}))
        .toMatchInlineSnapshot(`
        Object {
          "column": 2,
          "line": 3,
          "name": "section1_name0",
          "source": "section1_source0",
        }
      `);
      expect(consumer.originalPositionFor({line: add1(0), column: add0(2)}))
        .toMatchInlineSnapshot(`
        Object {
          "column": 2,
          "line": 3,
          "name": "section2_name0",
          "source": "section2_source0",
        }
      `);
    });

    test('unmapped regions', () => {
      const consumer = new Consumer({
        version: 3,
        sections: [
          {
            offset: {line: 0, column: 0},
            map: {
              version: 3,
              names: ['section0_name0'],
              sources: ['section0_source0'],
              mappings: 'CAEEA',
            },
          },
          {
            offset: {line: 0, column: 2},
            map: {
              version: 3,
              names: ['section1_name0'],
              sources: ['section1_source0'],
              mappings: 'CAEEA,C',
            },
          },
          {
            offset: {line: 0, column: 4},
            map: {
              version: 3,
              names: ['section2_name0'],
              sources: ['section2_source0'],
              mappings: 'CAEEA',
            },
          },
        ],
      });
      expect(consumer.originalPositionFor({line: add1(0), column: add0(0)}))
        .toMatchInlineSnapshot(`
        Object {
          "column": null,
          "line": null,
          "name": null,
          "source": null,
        }
      `);
      expect(consumer.originalPositionFor({line: add1(0), column: add0(1)}))
        .toMatchInlineSnapshot(`
        Object {
          "column": 2,
          "line": 3,
          "name": "section0_name0",
          "source": "section0_source0",
        }
      `);
      expect(consumer.originalPositionFor({line: add1(0), column: add0(3)}))
        .toMatchInlineSnapshot(`
        Object {
          "column": 2,
          "line": 3,
          "name": "section1_name0",
          "source": "section1_source0",
        }
      `);
      expect(consumer.originalPositionFor({line: add1(0), column: add0(4)}))
        .toMatchInlineSnapshot(`
        Object {
          "column": null,
          "line": null,
          "name": null,
          "source": null,
        }
      `);
      expect(consumer.originalPositionFor({line: add1(0), column: add0(5)}))
        .toMatchInlineSnapshot(`
        Object {
          "column": 2,
          "line": 3,
          "name": "section2_name0",
          "source": "section2_source0",
        }
      `);
      expect(consumer.originalPositionFor({line: add1(0), column: add0(6)}))
        .toMatchInlineSnapshot(`
        Object {
          "column": 2,
          "line": 3,
          "name": "section2_name0",
          "source": "section2_source0",
        }
      `);
      expect(consumer.originalPositionFor({line: add1(0), column: add0(7)}))
        .toMatchInlineSnapshot(`
        Object {
          "column": 2,
          "line": 3,
          "name": "section2_name0",
          "source": "section2_source0",
        }
      `);
    });
  });

  describe('sourceContentFor', () => {
    test('empty map', () => {
      const consumer = new Consumer({
        version: 3,
        sections: [],
      });
      expect(consumer.sourceContentFor('a.js', true)).toBeNull();
    });

    test('found in section', () => {
      const consumer = new Consumer({
        version: 3,
        sections: [
          {
            offset: {line: 0, column: 0},
            map: {
              version: 3,
              mappings: '',
              names: [],
              sources: ['a.js'],
              sourcesContent: ['content of a.js'],
            },
          },
        ],
      });
      expect(consumer.sourceContentFor('a.js', true)).toBe('content of a.js');
    });

    test('found in multiple sections', () => {
      const consumer = new Consumer({
        version: 3,
        sections: [
          {
            offset: {line: 0, column: 0},
            map: {
              version: 3,
              mappings: '',
              names: [],
              sources: ['a.js'],
              sourcesContent: [null],
            },
          },
          {
            offset: {line: 1, column: 0},
            map: {
              version: 3,
              mappings: '',
              names: [],
              sources: ['a.js'],
              sourcesContent: ['content of a.js'],
            },
          },
        ],
      });
      expect(consumer.sourceContentFor('a.js', true)).toBe('content of a.js');
    });
  });
});

describe('.file', () => {
  test('is passed through from map', () => {
    const consumer = new Consumer({
      version: 3,
      mappings: '',
      names: [],
      sources: [],
      file: 'foo',
    });
    expect(consumer.file).toBe('foo');
  });

  test('is not required', () => {
    const consumer = new Consumer({
      version: 3,
      mappings: '',
      names: [],
      sources: [],
    });
    expect(consumer.file).toBe(undefined);
  });

  test('works with indexed map', () => {
    const consumer = new Consumer({
      version: 3,
      sections: [],
      file: 'foo',
    });
    expect(consumer.file).toBe('foo');
  });
});

describe('source path normalization', () => {
  test('./foo.js -> foo.js', () => {
    const consumer = new Consumer({
      version: 3,
      mappings: 'AAAA',
      names: [],
      sources: ['./foo.js'],
    });
    expect(
      consumer.originalPositionFor({line: add1(0), column: add0(0)}).source,
    ).toBe('foo.js');
  });

  test('if sourceRoot is absolute, relativize absolute sources', () => {
    const consumer = new Consumer({
      version: 3,
      mappings: 'AAAA',
      names: [],
      sources: ['/some/other/absolute/path/foo.js'],
      sourceRoot: '/some/absolute/path',
    });
    expect(
      consumer.originalPositionFor({line: add1(0), column: add0(0)}).source,
    ).toBe('../../other/absolute/path/foo.js');
  });

  test('if sourceRoot is absolute, keep relative sources relative', () => {
    const consumer = new Consumer({
      version: 3,
      mappings: 'AAAA',
      names: [],
      sources: ['more/directories/foo.js'],
      sourceRoot: '/some/absolute/path',
    });
    expect(
      consumer.originalPositionFor({line: add1(0), column: add0(0)}).source,
    ).toBe('more/directories/foo.js');
  });
});

describe('known bugs in source-map', () => {
  it('accepts mappings without sources in an indexed map', () => {
    const map = {
      version: 3,
      sections: [
        {
          offset: {line: 0, column: 0},
          map: {
            version: 3,
            names: [],
            sources: [],
            mappings: 'A',
          },
        },
      ],
    };
    const consumer = new Consumer(map);
    const mappings = [];
    consumer.eachMapping(mapping => {
      mappings.push(mapping);
    });
    expect(mappings).toEqual([
      objectContaining({
        source: null,
        generatedLine: 1,
        generatedColumn: 0,
        originalLine: null,
        originalColumn: null,
        name: null,
      }),
    ]);
  });

  it('accepts mappings without names in an indexed map', () => {
    const map = {
      version: 3,
      sections: [
        {
          offset: {line: 0, column: 0},
          map: {
            version: 3,
            names: [],
            sources: ['foo.js'],
            mappings: 'AAAA',
          },
        },
      ],
    };
    const consumer = new Consumer(map);
    const mappings = [];
    consumer.eachMapping(mapping => {
      mappings.push(mapping);
    });
    expect(mappings).toEqual([
      objectContaining({
        generatedLine: 1,
        generatedColumn: 0,
        originalLine: 1,
        originalColumn: 0,
        name: null,
      }),
    ]);
  });

  it('accepts mappings to the first name entry in an indexed map', () => {
    const map = {
      version: 3,
      sections: [
        {
          offset: {line: 0, column: 0},
          map: {
            version: 3,
            names: ['first'],
            sources: ['foo.js'],
            mappings: 'AAAAA',
          },
        },
      ],
    };
    const consumer = new Consumer(map);
    const mappings = [];
    consumer.eachMapping(mapping => {
      mappings.push(mapping);
    });
    expect(mappings).toEqual([
      objectContaining({
        generatedLine: 1,
        generatedColumn: 0,
        originalLine: 1,
        originalColumn: 0,
        name: 'first',
      }),
    ]);
  });

  it('processes sources correctly in an indexed map', () => {
    const map = {
      version: 3,
      sections: [
        {
          offset: {line: 0, column: 0},
          map: {
            version: 3,
            names: ['first', 'second'],
            sources: ['foo.js', 'bar.js'],
            mappings: 'AAAAA,CCCCC',
          },
        },
      ],
    };
    const consumer = new Consumer(map);
    const mappings = [];
    consumer.eachMapping(mapping => {
      mappings.push(mapping);
    });
    expect(mappings).toEqual([
      objectContaining({
        source: 'foo.js',
        generatedLine: 1,
        generatedColumn: 0,
        originalLine: 1,
        originalColumn: 0,
      }),
      objectContaining({
        source: 'bar.js',
        generatedLine: 1,
        generatedColumn: 1,
        originalLine: 2,
        originalColumn: 1,
      }),
    ]);
  });

  it('supports unmapped sections in an indexed map', () => {
    const map = {
      version: 3,
      sections: [
        {
          offset: {line: 0, column: 0},
          map: {
            version: 3,
            names: ['first', 'second'],
            sources: ['foo.js', 'bar.js'],
            mappings: 'AAAAA,CCCCC',
          },
        },
        {
          offset: {line: 0, column: 2},
          map: {
            version: 3,
            names: [],
            sources: [],
            mappings: '',
          },
        },
      ],
    };
    const consumer = new Consumer(map);
    expect(
      consumer.originalPositionFor({line: add1(1), column: add0(0)}),
    ).toEqual(
      expect.objectContaining({
        source: null,
        line: null,
        column: null,
        name: null,
      }),
    );
  });

  it('performs lookup correctly in an indexed map', () => {
    const map = {
      version: 3,
      sections: [
        {
          offset: {line: 0, column: 0},
          map: {
            version: 3,
            names: ['first', 'second'],
            sources: ['foo.js', 'bar.js'],
            mappings: 'AAAAA,CCCCC',
          },
        },
        {
          offset: {line: 0, column: 2},
          map: {
            version: 3,
            names: ['third', 'fourth'],
            sources: ['baz.js', 'quux.js'],
            mappings: 'AAAAA,CCCCC',
          },
        },
      ],
    };
    const consumer = new Consumer(map);
    expect(
      consumer.originalPositionFor({line: add1(0), column: add0(0)}),
    ).toEqual(objectContaining({source: 'foo.js', line: 1, column: 0}));
    expect(
      consumer.originalPositionFor({line: add1(0), column: add0(1)}),
    ).toEqual(objectContaining({source: 'bar.js', line: 2, column: 1}));
    expect(
      consumer.originalPositionFor({line: add1(0), column: add0(2)}),
    ).toEqual(objectContaining({source: 'baz.js', line: 1, column: 0}));
    expect(
      consumer.originalPositionFor({line: add1(0), column: add0(3)}),
    ).toEqual(objectContaining({source: 'quux.js', line: 2, column: 1}));
  });

  it('performs lookup correctly in a non-indexed map', () => {
    const map = {
      version: 3,
      names: ['first', 'second'],
      sources: ['foo.js', 'bar.js'],
      mappings: 'AAAAA,CCCCC',
    };
    const consumer = new Consumer(map);
    expect(
      consumer.originalPositionFor({line: add1(0), column: add0(0)}),
    ).toEqual(
      objectContaining({source: 'foo.js', line: 1, column: 0, name: 'first'}),
    );
    expect(
      consumer.originalPositionFor({line: add1(0), column: add0(1)}),
    ).toEqual(
      objectContaining({source: 'bar.js', line: 2, column: 1, name: 'second'}),
    );
    expect(
      consumer.originalPositionFor({line: add1(0), column: add0(2)}),
    ).toEqual(
      objectContaining({source: 'bar.js', line: 2, column: 1, name: 'second'}),
    );
  });
});
