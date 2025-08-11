// check-label/check-label-compare-match-semver.spec.ts

import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';

import { validateVersion } from './check-label.ts';

const assertError = /Version is incorrect based on Pull Request label/u; // expected error message when version is incorrect - assert adds additional information to error, so regex is used

describe('compare and match semver', async () => {
  it('Test basic patch', async () => {
    assert.equal(validateVersion('1.0.1', '1.0.0', 'patch'), true);

    assert.throws(() => validateVersion('1.0.0', '1.0.0', 'patch'), {
      message: assertError,
    });
  });

  it('Test minor', async () => {
    assert.equal(validateVersion('1.1.0', '1.0.2', 'minor'), true);

    assert.throws(() => validateVersion('1.1.1', '1.0.1', 'minor'), {
      message: assertError,
    });
    assert.throws(() => validateVersion('1.1.2', '1.0.1', 'minor'), {
      message: assertError,
    });
  });

  it('Test major', async () => {
    assert.equal(validateVersion('2.0.0', '1.0.2', 'major'), true);

    assert.throws(() => validateVersion('2.20.0', '1.20.1', 'major'), {
      message: assertError,
    });

    assert.throws(() => validateVersion('2.0.1', '1.20.1', 'major'), {
      message: assertError,
    });
  });

  it('Test major fails with large version gap', async () => {
    assert.throws(() => validateVersion('8.0.0', '1.0.0', 'major'), {
      message: assertError,
    });
  });

  it('Test throws when main is ahead', async () => {
    assert.throws(() => validateVersion('8.0.0', '9.0.0', 'major'), {
      message: 'main version is ahead of branch version',
    });
  });

  it('Test invalid label', async () => {
    assert.throws(() => validateVersion('1.0.0', '1.0.0', 'invalid'), {
      message: 'Invalid label',
    });
  });
});
