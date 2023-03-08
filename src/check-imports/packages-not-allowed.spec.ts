// check-imports/packages-not-allowed.spec.ts

import { strict as assert } from 'node:assert';
import validRange from 'semver/ranges/valid';
import notAllowed from './packages-not-allowed';

describe('packages not allowed', () => {
  it('contains a list of names, valid ranges, and reasons', async () => {
    notAllowed.forEach(([name, range, reason]) => {
      assert.ok(name !== undefined);
      assert.ok(validRange(range));
      assert.ok(reason !== undefined && reason.length > 10); // Ten is an arbitrary length to ensure a full sentence used in the reason.
    });
  });
});
