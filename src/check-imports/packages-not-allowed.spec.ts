// check-imports/packages-not-allowed.spec.ts

import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';

import * as semver from 'semver';

import notAllowed, { SECURITY_RISK } from './packages-not-allowed.ts';

describe('packages not allowed', async () => {
  it('contains a list of names, valid ranges, and reasons', async () => {
    notAllowed.forEach(([name, range, reason]) => {
      assert.ok(name !== '');
      assert.ok(semver.validRange(range));
      assert.ok(reason.length > 10); // Ten is an arbitrary length to ensure a full sentence used in the reason.
    });
  });
  it('contains the specific not allowed axios versions', async () => {
    assert.ok(
      notAllowed.some(
        ([name, range, reason]) =>
          name === 'axios' &&
          range === '0.30.4 || >=1.14.1' &&
          reason === SECURITY_RISK,
      ),
      'Should contain axios@0.30.4 || >=1.14.1 as not allowed',
    );
  });
});
