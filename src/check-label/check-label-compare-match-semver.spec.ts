// check-label/check-label-compare-match-semver.spec.ts

import { strict as assert } from 'node:assert';

import { validateVersionCompareMatchesSemver } from './check-label';

describe('compare and match semver', () => {
  it('Test basic patch', async () => {
    assert.equal(validateVersionCompareMatchesSemver('1.0.1', '1.0.0'), 'patch');
    assert.equal(validateVersionCompareMatchesSemver('1.0.0', '1.0.0'), null);
  });

  it('Test minor', async () => {
    assert.equal(validateVersionCompareMatchesSemver('1.1.0', '1.0.2'), 'minor');

    assert.throws(() => validateVersionCompareMatchesSemver('1.1.1', '1.0.1'), {
      message: 'Minor version bump but patch version is not 0',
    });
    assert.throws(() => validateVersionCompareMatchesSemver('1.1.2', '1.0.1'), {
      message: 'Minor version bump but patch version is not 0',
    });
  });

  it('Test major', async () => {
    assert.equal(validateVersionCompareMatchesSemver('2.0.0', '1.0.2'), 'major');

    assert.throws(() => validateVersionCompareMatchesSemver('2.20.0', '1.20.1'), {
      message: 'Major version bump but minor and patch version is not 0',
    });

    assert.throws(() => validateVersionCompareMatchesSemver('2.0.1', '1.20.1'), {
      message: 'Major version bump but minor and patch version is not 0',
    });
  });
});
