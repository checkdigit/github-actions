// coverage-reporter/util.spec.ts

/**
 * Based on code from lcov-report-action, see LICENSE.lcov-reporter-action.txt.
 * https://github.com/romeovs/lcov-reporter-action
 */

import { strict as assert } from 'node:assert';

import { createHref } from './util';

describe('util', () => {
  it('create simple url to file', () => {
    const options = {
      repository: 'example/foo',
      commit: '2e15bee6fe0df5003389aa5ec894ec0fea2d874a',
      prefix: '/files/project/',
    };
    const file = {
      file: '/files/project/index.js',
      functions: {
        found: 0,
        hit: 0,
        details: [],
      },
    };
    assert.deepEqual(createHref(options, file), {
      href: `https://github.com/${options.repository}/blob/${options.commit}/index.js`,
      filename: 'index.js',
    });
  });

  it('create url to file with simple working dir path', () => {
    const options = {
      repository: 'example/foo',
      commit: '2e15bee6fe0df5003389aa5ec894ec0fea2d874a',
      prefix: '/files/project/',
      workingDir: 'frontend',
    };
    const file = {
      file: '/files/project/index.js',
      functions: {
        found: 0,
        hit: 0,
        details: [],
      },
    };
    assert.deepEqual(createHref(options, file), {
      href: `https://github.com/${options.repository}/blob/${options.commit}/frontend/index.js`,
      filename: 'index.js',
    });
  });

  it('working dir relative path', () => {
    const options = {
      repository: 'example/foo',
      commit: '2e15bee6fe0df5003389aa5ec894ec0fea2d874a',
      prefix: '/files/project/',
      workingDir: './frontend/',
    };
    const file = {
      file: '/files/project/index.js',
      functions: {
        found: 0,
        hit: 0,
        details: [],
      },
    };
    assert.deepEqual(createHref(options, file), {
      href: `https://github.com/${options.repository}/blob/${options.commit}/frontend/index.js`,
      filename: 'index.js',
    });
  });

  it('working dir path with leading and trailing slashed', () => {
    const options = {
      repository: 'example/foo',
      commit: '2e15bee6fe0df5003389aa5ec894ec0fea2d874a',
      prefix: '/files/project/',
      workingDir: '/frontend/',
    };
    const file = {
      file: '/files/project/src/foo.js',
      functions: {
        found: 0,
        hit: 0,
        details: [],
      },
    };
    assert.deepEqual(createHref(options, file), {
      href: `https://github.com/${options.repository}/blob/${options.commit}/frontend/src/foo.js`,
      filename: 'foo.js',
    });
  });
});
