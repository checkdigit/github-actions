// dependency-review/report.ts

import { warning } from '@actions/core';

import type {
  DeniedFinding,
  DependencyChange,
  LicenseFinding,
  ReviewResult,
  ReviewStatistics,
  VulnerabilityFinding,
} from './types.ts';

const MAX_SUMMARY_BYTES = 900_000;
const MAX_OUTPUT_BYTES = 900_000;

export function truncateUtf8(value: string, maximumBytes: number): string {
  const bytes = Buffer.from(value);
  if (bytes.length <= maximumBytes) {
    return value;
  }
  const decoder = new TextDecoder('utf8', { fatal: true });
  for (
    let length = maximumBytes;
    length >= Math.max(0, maximumBytes - 4);
    length -= 1
  ) {
    try {
      return decoder.decode(bytes.subarray(0, length));
    } catch {
      // UTF-8 code points use at most four bytes; try the preceding boundary.
    }
  }
  throw new Error('Unable to truncate UTF-8 report at a valid boundary');
}

function escape(value: unknown): string {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('|', '&#124;')
    .replaceAll('\r', ' ')
    .replaceAll('\n', ' ');
}

function table(headers: string[], rows: unknown[][]): string {
  if (rows.length === 0) {
    return '_None._\n';
  }
  return [
    `| ${headers.map(escape).join(' | ')} |`,
    `| ${headers.map(() => '---').join(' | ')} |`,
    ...rows.map((row) => `| ${row.map(escape).join(' | ')} |`),
    '',
  ].join('\n');
}

function changesSection(changes: DependencyChange[]): string {
  return table(
    ['Change', 'Manifest', 'Package', 'Version', 'Scope'],
    changes.map((change) => [
      change.changeType,
      change.manifest,
      change.name,
      change.changeType === 'changed'
        ? `${change.previousVersion ?? '?'} → ${change.version}`
        : change.version,
      change.scope,
    ]),
  );
}

function vulnerabilitySection(
  findings: VulnerabilityFinding[],
  showPatchedVersions: boolean,
): string {
  const headers = ['Manifest', 'Package', 'Severity', 'Advisory', 'Summary'];
  if (showPatchedVersions) {
    headers.push('First fixed');
  }
  return table(
    headers,
    findings.map((finding) => [
      finding.dependency.manifest,
      `${finding.dependency.name}@${finding.dependency.version}`,
      finding.severity,
      finding.advisory,
      finding.summary,
      ...(showPatchedVersions ? [finding.fixedVersion ?? 'Not published'] : []),
    ]),
  );
}

function licenseSection(findings: LicenseFinding[]): string {
  return table(
    ['Manifest', 'Package', 'License', 'Result', 'Detail'],
    findings.map((finding) => [
      finding.dependency.manifest,
      `${finding.dependency.name}@${finding.dependency.version}`,
      finding.license ?? 'Unknown',
      finding.reason,
      finding.detail ?? '',
    ]),
  );
}

function deniedSection(findings: DeniedFinding[]): string {
  return table(
    ['Manifest', 'Package', 'Rule'],
    findings.map((finding) => [
      finding.dependency.manifest,
      `${finding.dependency.name}@${finding.dependency.version}`,
      finding.rule,
    ]),
  );
}

export function statisticsLogLines(statistics: ReviewStatistics): string[] {
  return [
    `Inventory: lockfiles base=${statistics.lockfiles.base}, head=${statistics.lockfiles.head}; dependency occurrences base=${statistics.dependencyOccurrences.base}, head=${statistics.dependencyOccurrences.head}`,
    `Dependency changes: added=${statistics.changes.added}, changed=${statistics.changes.changed}, removed=${statistics.changes.removed}; runtime=${statistics.changes.runtime}, development=${statistics.changes.development}`,
    `Vulnerability check (${statistics.vulnerabilities.enabled ? 'enabled' : 'disabled'}): OSV package/version queries=${statistics.vulnerabilities.osvQueries}, base findings=${statistics.vulnerabilities.baseFindings}, head findings=${statistics.vulnerabilities.headFindings}, newly introduced=${statistics.vulnerabilities.introduced}, policy-matching=${statistics.vulnerabilities.policyMatching}`,
    `License check (${statistics.licenses.enabled ? 'enabled' : 'disabled'}): changed npm candidates=${statistics.licenses.candidates}, issues=${statistics.licenses.issues}, blocking=${statistics.licenses.blockingIssues}`,
    `Package policy: denied=${statistics.policy.denied}, unsupported sources=${statistics.policy.unsupportedSources}; total blocking findings=${statistics.blockingFindings}`,
  ];
}

function statisticsSection(statistics: ReviewStatistics): string {
  return table(
    ['Area', 'Statistic', 'Value'],
    [
      ['Inventory', 'Base lockfiles', statistics.lockfiles.base],
      ['Inventory', 'Head lockfiles', statistics.lockfiles.head],
      [
        'Inventory',
        'Base dependency occurrences',
        statistics.dependencyOccurrences.base,
      ],
      [
        'Inventory',
        'Head dependency occurrences',
        statistics.dependencyOccurrences.head,
      ],
      ['Changes', 'Added', statistics.changes.added],
      ['Changes', 'Changed', statistics.changes.changed],
      ['Changes', 'Removed', statistics.changes.removed],
      ['Changes', 'Runtime', statistics.changes.runtime],
      ['Changes', 'Development', statistics.changes.development],
      [
        'Vulnerabilities',
        `OSV queries (${statistics.vulnerabilities.enabled ? 'enabled' : 'disabled'})`,
        statistics.vulnerabilities.osvQueries,
      ],
      [
        'Vulnerabilities',
        'Head vulnerable occurrences',
        statistics.vulnerabilities.headFindings,
      ],
      [
        'Vulnerabilities',
        'Newly introduced before policy',
        statistics.vulnerabilities.introduced,
      ],
      [
        'Vulnerabilities',
        'Policy-matching findings',
        statistics.vulnerabilities.policyMatching,
      ],
      [
        'Licenses',
        `Changed npm candidates (${statistics.licenses.enabled ? 'enabled' : 'disabled'})`,
        statistics.licenses.candidates,
      ],
      ['Licenses', 'Issues', statistics.licenses.issues],
      ['Licenses', 'Blocking issues', statistics.licenses.blockingIssues],
      ['Package policy', 'Denied', statistics.policy.denied],
      [
        'Package policy',
        'Unsupported sources',
        statistics.policy.unsupportedSources,
      ],
      ['Outcome', 'Total blocking findings', statistics.blockingFindings],
    ],
  );
}

export function renderReport(
  result: ReviewResult,
  showPatchedVersions: boolean,
): string {
  const content = [
    '# Node dependency review',
    '',
    `Scanned lockfiles: ${result.scannedFiles.length}; dependency changes: ${result.changes.length}; new policy-matching vulnerabilities: ${result.vulnerabilities.length}; license issues: ${result.licenseIssues.length}; denied or unsupported packages: ${result.denied.length}.`,
    '',
    '## Check statistics',
    '',
    statisticsSection(result.statistics),
    '## Scanned files',
    '',
    result.scannedFiles.length === 0
      ? '_No package-lock.json files found._'
      : result.scannedFiles.map((path) => `- \`${escape(path)}\``).join('\n'),
    '',
    '## Dependency changes',
    '',
    changesSection(result.changes),
    '## Newly introduced vulnerabilities',
    '',
    vulnerabilitySection(result.vulnerabilities, showPatchedVersions),
    '## License issues',
    '',
    licenseSection(result.licenseIssues),
    '## Denied packages or unsupported sources',
    '',
    deniedSection(result.denied),
  ].join('\n');
  if (Buffer.byteLength(content) <= MAX_SUMMARY_BYTES) {
    return content;
  }
  warning(
    'Dependency review summary exceeded the safe size limit and was shortened',
  );
  const suffix = '\n\n_Report truncated because it exceeded 900 KB._\n';
  return `${truncateUtf8(content, MAX_SUMMARY_BYTES - Buffer.byteLength(suffix))}${suffix}`;
}

export function safeJsonOutput(value: unknown[], outputName: string): string {
  let items = value;
  let encoded = JSON.stringify(items);
  while (Buffer.byteLength(encoded) > MAX_OUTPUT_BYTES && items.length > 0) {
    items = items.slice(0, Math.floor(items.length / 2));
    encoded = JSON.stringify(items);
  }
  if (items.length !== value.length) {
    warning(
      `${outputName} contained ${value.length} records and was truncated to ${items.length} to stay below the GitHub output size limit`,
    );
  }
  return encoded;
}
