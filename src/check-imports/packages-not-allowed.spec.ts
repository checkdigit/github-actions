// check-imports/packages-not-allowed.spec.ts

import { strict as assert } from 'node:assert';
import validRange from 'semver/ranges/valid';
import notAllowed from './packages-not-allowed';

describe('packages not allowed', () => {
  it('contains a list of names and valid ranges', async () => {
    notAllowed.forEach(([name, range]) => {
      assert.ok(name !== undefined);
      assert.ok(validRange(range));
    });
  });
});
