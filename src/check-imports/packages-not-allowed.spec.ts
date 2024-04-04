// check-imports/packages-not-allowed.spec.ts

import { strict as assert } from 'node:assert';

import { describe, it } from '@jest/globals';
import validRange from 'semver/ranges/valid';

import notAllowed from './packages-not-allowed';

describe('packages not allowed', () => {
  it('contains a list of names, valid ranges, and reasons', async () => {
    notAllowed.forEach(([name, range, reason]) => {
      assert.ok(name !== '');
      assert.ok(validRange(range));
      assert.ok(reason.length > 10); // Ten is an arbitrary length to ensure a full sentence used in the reason.
    });
  });
});
