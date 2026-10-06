// update-dependencies/versions.spec.ts

import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';

import { selectVersion } from './versions.ts';

const versions = ['1.2.3', '1.2.4', '1.3.0', '2.0.0', '3.0.0-beta.1'];

describe('dependency version selection', () => {
  it('preserves range prefixes and limits patch updates', () => {
    assert.equal(selectVersion('^1.2.3', versions, 'patch'), '^1.2.4');
    assert.equal(selectVersion('~1.2.3', versions, 'minor'), '~1.3.0');
  });
  it('limits minor updates and excludes prereleases', () => {
    assert.equal(selectVersion('1.2.3', versions, 'minor'), '1.3.0');
    assert.equal(selectVersion('1.2.3', versions, 'latest'), '2.0.0');
  });
  it('does not downgrade or change unsupported specs', () => {
    assert.equal(selectVersion('2.0.0', versions, 'latest'), undefined);
    assert.equal(selectVersion('workspace:*', versions, 'latest'), undefined);
    assert.equal(selectVersion('>=1', versions, 'minor'), undefined);
  });
  it('keeps minor scope within major zero', () => {
    assert.equal(
      selectVersion('^0.2.0', ['0.3.0', '1.0.0'], 'minor'),
      '^0.3.0',
    );
  });
});
