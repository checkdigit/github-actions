// dependency-review/config-report.spec.ts

import { strict as assert } from 'node:assert';
import { describe, it, mock } from 'node:test';

mock.module('@actions/core', {
  namedExports: {
    error: mock.fn(),
    getInput: mock.fn(),
    setOutput: mock.fn(),
    summary: {
      addRaw(): { write(): Promise<void> } {
        return { write: async () => undefined };
      },
    },
    warning: mock.fn(),
  },
});

const { readConfiguration } = await import('./config.ts');
const { buildAnnotations } = await import('./dependency-review.ts');
const { renderReport, safeJsonOutput, truncateUtf8 } =
  await import('./report.ts');

function inputs(values: Record<string, string>): (name: string) => string {
  return (name) => values[name] ?? '';
}

describe('dependency review configuration and reporting', () => {
  it('validates inputs and preserves compatibility aliases', () => {
    const configuration = readConfiguration(
      inputs({
        'github-token': 'token',
        'fail-on-severity': 'high',
        'fail-on-scopes': 'runtime, development',
        'allow-ghsas': 'GHSA-2345-6789-cfgh',
        'allow-advisories': 'CVE-2026-12345',
        'allow-licenses': 'MIT,Apache-2.0',
      }),
    );
    assert.equal(configuration.failOnSeverity, 'high');
    assert.deepEqual(
      [...configuration.failOnScopes],
      ['runtime', 'development'],
    );
    assert.ok(configuration.allowedAdvisories.has('GHSA-2345-6789-CFGH'));
    assert.ok(configuration.allowedAdvisories.has('CVE-2026-12345'));
    const arbitrary = readConfiguration(
      inputs({ 'github-token': 'token', 'allow-advisories': 'MAL-2026-ABC' }),
    );
    assert.ok(arbitrary.allowedAdvisories.has('MAL-2026-ABC'));
    assert.doesNotThrow(() =>
      readConfiguration(
        inputs({
          'github-token': 'token',
          'allow-licenses':
            'MIT, Apache-2.0, Apache-2.0 AND MIT, ISC AND MIT AND MPL-2.0, Apache-2.0 AND LicenseRef-scancode-unknown-license-reference',
        }),
      ),
    );
    assert.throws(
      () =>
        readConfiguration(
          inputs({
            'github-token': 'token',
            'allow-licenses': 'MIT',
            'deny-licenses': 'GPL-3.0-only',
          }),
        ),
      /mutually exclusive/u,
    );
  });

  it('escapes untrusted report content and emits parseable JSON output', () => {
    const report = renderReport(
      {
        changes: [
          {
            changeType: 'added',
            manifest: '<script>|package-lock.json',
            path: 'node_modules/pkg',
            name: 'pkg',
            version: '1.0.0',
            scope: 'runtime',
            optional: false,
            purl: 'pkg:npm/pkg@1.0.0',
            source: 'npm',
          },
        ],
        vulnerabilities: [],
        licenseIssues: [],
        denied: [],
        scannedFiles: ['head:<script>|package-lock.json'],
      },
      true,
    );
    // Match raw and HTML-escaped untrusted report content.
    const rawScript = /<script>/u;
    // Match the escaped equivalent of the test script tag.
    const escapedScript = /&lt;script&gt;/u;
    assert.doesNotMatch(report, rawScript);
    assert.match(report, escapedScript);
    assert.deepEqual(JSON.parse(safeJsonOutput([{ value: 'ok' }], 'test')), [
      { value: 'ok' },
    ]);
    const truncated = truncateUtf8('a😀b', 5);
    assert.equal(truncated, 'a😀');
    assert.equal(Buffer.byteLength(truncated), 5);
  });

  it('uses warning annotations for blocking findings in warn-only mode', () => {
    const item = {
      manifest: 'package-lock.json',
      path: 'node_modules/pkg',
      name: 'pkg',
      version: '1.0.0',
      scope: 'runtime' as const,
      optional: false,
      purl: 'pkg:npm/pkg@1.0.0',
      source: 'npm' as const,
    };
    const annotations = buildAnnotations(
      {
        vulnerabilities: [
          {
            dependency: item,
            advisory: 'MAL-TEST',
            aliases: ['MAL-TEST'],
            summary: 'test',
            severity: 'high',
          },
        ],
        licenseIssues: [],
        denied: [],
      },
      false,
      true,
    );
    assert.deepEqual(
      annotations.map(({ level }) => level),
      ['warning'],
    );
  });
});
