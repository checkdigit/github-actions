// dependency-review/report.ts

import { warning } from '@actions/core';

import type {
  DeniedFinding,
  DependencyChange,
  LicenseFinding,
  ReviewResult,
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

export function renderReport(
  result: ReviewResult,
  showPatchedVersions: boolean,
): string {
  const content = [
    '# Node dependency review',
    '',
    `Scanned lockfiles: ${result.scannedFiles.length}; dependency changes: ${result.changes.length}; new policy-matching vulnerabilities: ${result.vulnerabilities.length}; license issues: ${result.licenseIssues.length}; denied or unsupported packages: ${result.denied.length}.`,
    '',
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
