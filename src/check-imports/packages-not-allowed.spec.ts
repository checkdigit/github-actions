// check-imports/packages-not-allowed.spec.ts

import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';

import * as semver from 'semver';

import notAllowed from './packages-not-allowed.ts';

describe('packages not allowed', async () => {
  it('contains a list of names, valid ranges, and reasons', async () => {
    notAllowed.forEach(([name, range, reason]) => {
      assert.ok(name !== '');
      assert.ok(semver.validRange(range));
      assert.ok(reason.length > 10); // Ten is an arbitrary length to ensure a full sentence used in the reason.
    });
  });
});
