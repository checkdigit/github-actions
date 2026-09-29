// dependency-review/policy.spec.ts

import { strict as assert } from 'node:assert';
import { afterEach, describe, it } from 'node:test';

import nock from 'nock';

import {
  checkLicenses,
  clearRegistryCache,
  validateLicenseIdentifiers,
} from './licenses.ts';
import {
  deniedDependencies,
  filterVulnerabilities,
  unsupportedSourceDependencies,
} from './policy.ts';
import type { Dependency, VulnerabilityFinding } from './types.ts';

function dependency(overrides: Partial<Dependency> = {}): Dependency {
  return {
    manifest: 'package-lock.json',
    path: 'node_modules/pkg',
    name: 'pkg',
    version: '1.0.0',
    scope: 'runtime',
    optional: false,
    purl: 'pkg:npm/pkg@1.0.0',
    source: 'npm',
    ...overrides,
  };
}

describe('dependency review policy', () => {
  afterEach(() => {
    nock.cleanAll();
    clearRegistryCache();
  });

  it('evaluates SPDX allow and deny policy including OR expressions', async () => {
    nock('https://registry.npmjs.org').get('/pkg/1.0.0').reply(200, {
      license: 'GPL-3.0-only OR MIT',
    });
    const allowed = await checkLicenses(
      [dependency({ license: 'untrusted-lock-license' })],
      {
        allowLicenses: validateLicenseIdentifiers(['MIT']),
        denyLicenses: new Set(),
        allowedDependencies: [],
      },
    );
    assert.deepEqual(allowed, []);

    nock('https://registry.npmjs.org').get('/pkg/2.0.0').reply(200, {
      license: 'GPL-3.0-only AND MIT',
    });
    const denied = await checkLicenses(
      [dependency({ version: '2.0.0', license: 'MIT' })],
      {
        allowLicenses: new Set(),
        denyLicenses: validateLicenseIdentifiers(['GPL-3.0-only']),
        allowedDependencies: [],
      },
    );
    const deniedFinding = denied[0];
    assert.ok(deniedFinding);
    assert.equal(deniedFinding.reason, 'denied');
    assert.throws(
      () => validateLicenseIdentifiers(['Definitely not SPDX']),
      /Invalid SPDX expression/u,
    );
  });

  it('accepts complete SPDX expressions in license policy entries', async () => {
    nock('https://registry.npmjs.org').get('/pkg/3.0.0').reply(200, {
      license: 'MIT AND Apache-2.0',
    });
    assert.deepEqual(
      await checkLicenses([dependency({ version: '3.0.0' })], {
        allowLicenses: validateLicenseIdentifiers(['Apache-2.0 AND MIT']),
        denyLicenses: new Set(),
        allowedDependencies: [],
      }),
      [],
    );

    assert.doesNotThrow(() =>
      validateLicenseIdentifiers([
        'ISC AND MIT AND MPL-2.0',
        'Apache-2.0 AND LicenseRef-scancode-unknown-license-reference',
      ]),
    );
  });

  it('uses registry metadata over a conflicting lockfile and preserves SPDX expression semantics', async () => {
    nock('https://registry.npmjs.org').get('/pkg/1.0.0').reply(200, {
      license: 'GPL-3.0-only',
    });
    const conflict = await checkLicenses([dependency({ license: 'MIT' })], {
      allowLicenses: validateLicenseIdentifiers(['MIT']),
      denyLicenses: new Set(),
      allowedDependencies: [],
    });
    assert.equal(conflict[0]?.reason, 'not-allowed');

    clearRegistryCache();
    nock('https://registry.npmjs.org').get('/pkg/1.0.0').reply(404);
    const unavailable = await checkLicenses([dependency({ license: 'MIT' })], {
      allowLicenses: validateLicenseIdentifiers(['MIT']),
      denyLicenses: new Set(),
      allowedDependencies: [],
    });
    assert.equal(unavailable[0]?.reason, 'unknown');

    clearRegistryCache();
    nock('https://registry.npmjs.org').get('/pkg/1.0.0').reply(200, {
      license: 'GPL-2.0-only WITH Classpath-exception-2.0',
    });
    assert.deepEqual(
      await checkLicenses([dependency()], {
        allowLicenses: validateLicenseIdentifiers([
          'GPL-2.0-only WITH Classpath-exception-2.0',
        ]),
        denyLicenses: new Set(),
        allowedDependencies: [],
      }),
      [],
    );
    assert.deepEqual(
      [...validateLicenseIdentifiers(['GPL-2.0+'])],
      ['GPL-2.0+'],
    );
  });

  it('falls back anonymously to npm metadata and reports unavailable metadata', async () => {
    nock('https://registry.npmjs.org').get('/pkg/1.0.0').reply(200, {
      license: 'Apache-2.0',
    });
    assert.deepEqual(
      await checkLicenses([dependency()], {
        allowLicenses: validateLicenseIdentifiers(['Apache-2.0']),
        denyLicenses: new Set(),
        allowedDependencies: [],
      }),
      [],
    );

    nock('https://registry.npmjs.org').get('/private/1.0.0').reply(404);
    const issues = await checkLicenses(
      [dependency({ name: 'private', purl: 'pkg:npm/private@1.0.0' })],
      {
        allowLicenses: new Set(),
        denyLicenses: new Set(),
        allowedDependencies: [],
      },
    );
    const issue = issues[0];
    assert.ok(issue);
    assert.equal(issue.reason, 'unknown');
    // Confirm the remediation explains private package behavior.
    assert.match(issue.detail ?? '', /private packages/u);

    clearRegistryCache();
    nock('https://registry.npmjs.org').get('/fallback/1.0.0').reply(404);
    assert.deepEqual(
      await checkLicenses([dependency({ name: 'fallback', license: 'MIT' })], {
        allowLicenses: new Set(),
        denyLicenses: new Set(),
        allowedDependencies: [],
      }),
      [],
    );
  });

  it('applies advisory, scope, package, PURL, and namespace policy', () => {
    const item = dependency({
      name: '@bad/pkg',
      purl: 'pkg:npm/%40bad/pkg@1.0.0',
    });
    const vulnerability: VulnerabilityFinding = {
      dependency: item,
      advisory: 'GHSA-2345-6789-cfgh',
      aliases: ['GHSA-2345-6789-cfgh', 'CVE-2026-12345'],
      summary: 'test',
      severity: 'critical',
    };
    assert.deepEqual(
      filterVulnerabilities([vulnerability], {
        threshold: 'high',
        scopes: new Set(['runtime']),
        allowedAdvisories: new Set(['CVE-2026-12345']),
      }),
      [],
    );
    assert.equal(deniedDependencies([item], [], ['@bad']).length, 1);
    assert.equal(
      deniedDependencies([item], ['pkg:npm/%40bad/pkg@1.0.0'], []).length,
      1,
    );
    assert.equal(
      unsupportedSourceDependencies([
        dependency({
          source: 'git',
          resolved: 'git+https://github.com/example/pkg.git',
        }),
      ])[0]?.reason,
      'unsupported-source',
    );
  });
});
