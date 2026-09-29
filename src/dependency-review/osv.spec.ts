// dependency-review/osv.spec.ts

import { strict as assert } from 'node:assert';
import { afterEach, describe, it } from 'node:test';

import nock from 'nock';

import {
  deriveSeverity,
  firstFixedVersion,
  newlyIntroducedVulnerabilities,
  scanVulnerabilities,
} from './osv.ts';
import type { Dependency } from './types.ts';

function dependency(
  version: string,
  manifest = 'package-lock.json',
): Dependency {
  return {
    manifest,
    path: 'node_modules/pkg',
    name: 'pkg',
    version,
    scope: 'runtime',
    optional: false,
    purl: `pkg:npm/pkg@${version}`,
    source: 'npm',
  };
}

describe('OSV client', () => {
  afterEach(() => nock.cleanAll());

  it('deduplicates batch queries, follows pagination, aliases advisories, and finds fixes', async () => {
    nock('https://api.osv.dev')
      .post('/v1/querybatch', {
        queries: [
          { package: { ecosystem: 'npm', name: 'pkg' }, version: '1.0.0' },
        ],
      })
      .reply(200, {
        results: [
          {
            vulns: [{ id: 'OSV-TEST-1' }],
            // eslint-disable-next-line camelcase
            next_page_token: 'next',
          },
        ],
      });
    nock('https://api.osv.dev')
      .post('/v1/querybatch', {
        queries: [
          {
            package: { ecosystem: 'npm', name: 'pkg' },
            version: '1.0.0',
            // eslint-disable-next-line camelcase
            page_token: 'next',
          },
        ],
      })
      .reply(200, { results: [{ vulns: [{ id: 'GHSA-2345-6789-cfgh' }] }] });
    const affected = [
      {
        package: { ecosystem: 'npm', name: 'pkg' },
        // eslint-disable-next-line camelcase
        ecosystem_specific: { severity: 'CRITICAL' },
        ranges: [
          {
            type: 'ECOSYSTEM',
            events: [{ introduced: '0' }, { fixed: '1.2.0' }],
          },
        ],
      },
    ];
    nock('https://api.osv.dev')
      .get('/v1/vulns/OSV-TEST-1')
      .reply(200, {
        id: 'OSV-TEST-1',
        aliases: ['GHSA-2345-6789-cfgh', 'CVE-2026-12345'],
        summary: 'Prototype pollution',
        affected,
      });
    nock('https://api.osv.dev')
      .get('/v1/vulns/GHSA-2345-6789-cfgh')
      .reply(200, {
        id: 'GHSA-2345-6789-cfgh',
        aliases: ['OSV-TEST-1', 'CVE-2026-12345'],
        summary: 'Prototype pollution',
        affected,
      });

    const findings = await scanVulnerabilities([
      dependency('1.0.0'),
      dependency('1.0.0', 'apps/other/package-lock.json'),
    ]);
    assert.equal(findings.length, 2);
    const finding = findings[0];
    assert.ok(finding);
    assert.equal(finding.advisory, 'GHSA-2345-6789-CFGH');
    assert.equal(finding.severity, 'critical');
    assert.equal(finding.fixedVersion, '1.2.0');
    assert.ok(nock.isDone());
  });

  it('retains only vulnerability occurrences introduced by the head revision', () => {
    const common = {
      advisory: 'GHSA-2345-6789-cfgh',
      aliases: ['GHSA-2345-6789-cfgh'],
      summary: 'test',
      severity: 'high' as const,
    };
    const base = [{ dependency: dependency('1.0.0'), ...common }];
    const unchanged = [{ dependency: dependency('1.0.0'), ...common }];
    const upgraded = [{ dependency: dependency('1.1.0'), ...common }];
    assert.deepEqual(newlyIntroducedVulnerabilities(base, unchanged), []);
    assert.equal(newlyIntroducedVulnerabilities(base, upgraded).length, 1);
    assert.equal(
      newlyIntroducedVulnerabilities(base, [
        {
          dependency: { ...dependency('1.0.0'), scope: 'development' },
          ...common,
        },
      ]).length,
      1,
    );
  });

  it('rounds CVSS v3 up and selects the fix for the installed interval', () => {
    const item = dependency('4.5.0');
    const vulnerability = {
      id: 'MAL-TEST',
      severity: [
        {
          type: 'CVSS_V3',
          score: 'CVSS:3.1/AV:N/AC:H/PR:N/UI:N/S:U/C:H/I:L/A:L',
        },
      ],
      affected: [
        {
          package: { ecosystem: 'npm', name: 'pkg' },
          ranges: [
            {
              type: 'ECOSYSTEM',
              events: [
                { introduced: '1.0.0' },
                { fixed: '2.0.0' },
                { introduced: '4.0.0' },
                { fixed: '5.0.0' },
              ],
            },
          ],
        },
      ],
    };
    assert.equal(deriveSeverity(vulnerability, item), 'high');
    assert.equal(firstFixedVersion(vulnerability, item), '5.0.0');
    assert.equal(
      firstFixedVersion(vulnerability, dependency('1.5.0')),
      '2.0.0',
    );
  });

  it('fails closed on an incomplete batch response', async () => {
    nock('https://api.osv.dev')
      .post('/v1/querybatch')
      .reply(200, { results: [] });
    await assert.rejects(
      scanVulnerabilities([dependency('1.0.0')]),
      /batch response was incomplete/u,
    );
  });
});
