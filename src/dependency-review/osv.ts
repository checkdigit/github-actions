// dependency-review/osv.ts

/* eslint-disable @checkdigit/require-service-call-response-declaration, @typescript-eslint/no-unnecessary-condition, camelcase, curly, max-depth, no-await-in-loop, no-continue, no-magic-numbers, preserve-caught-error, sonarjs/cognitive-complexity, unicorn/switch-case-braces */

import * as semver from 'semver';

import type {
  Dependency,
  OsvAffected,
  OsvSeverity,
  OsvVulnerability,
  Severity,
  VulnerabilityFinding,
} from './types.ts';

interface BatchQuery {
  package: { ecosystem: 'npm'; name: string };
  version: string;
  page_token?: string;
}

interface BatchResult {
  vulns?: { id?: unknown }[];
  next_page_token?: unknown;
}

const BATCH_SIZE = 500;
const DETAILS_CONCURRENCY = 20;

function queryKey(name: string, version: string): string {
  return `${name}\0${version}`;
}

async function fetchJson(url: string, init?: RequestInit): Promise<unknown> {
  let response: Response;
  try {
    const headers = new Headers(init?.headers);
    headers.set('accept', 'application/json');
    headers.set('content-type', 'application/json');
    headers.set('user-agent', 'checkdigit-dependency-review-action');
    response = await fetch(url, {
      ...init,
      headers,
      signal: AbortSignal.timeout(30_000),
    });
  } catch (error) {
    throw new Error(`OSV request failed: ${String(error)}`);
  }
  if (!response.ok) {
    throw new Error(
      `OSV request failed with HTTP ${response.status} ${response.statusText}`,
    );
  }
  try {
    return await response.json();
  } catch (error) {
    throw new Error(`OSV returned invalid JSON: ${String(error)}`);
  }
}

function parseBatchResponse(value: unknown, expected: number): BatchResult[] {
  if (
    value === null ||
    typeof value !== 'object' ||
    !('results' in value) ||
    !Array.isArray(value.results) ||
    value.results.length !== expected
  ) {
    throw new Error(
      `OSV batch response was incomplete: expected ${expected} ordered results`,
    );
  }
  return value.results as BatchResult[];
}

async function queryBatch(
  queries: BatchQuery[],
): Promise<Map<string, Set<string>>> {
  const idsByQuery = new Map<string, Set<string>>();
  let pending = queries;
  let pageCount = 0;

  while (pending.length > 0) {
    pageCount += 1;
    if (pageCount > 100) {
      throw new Error('OSV pagination exceeded 100 pages');
    }
    const value = await fetchJson('https://api.osv.dev/v1/querybatch', {
      method: 'POST',
      body: JSON.stringify({ queries: pending }),
    });
    const results = parseBatchResponse(value, pending.length);
    const next: BatchQuery[] = [];

    for (const [index, result] of results.entries()) {
      const query = pending[index];
      if (
        query === undefined ||
        result === null ||
        typeof result !== 'object'
      ) {
        throw new Error('OSV batch response contained an invalid result');
      }
      const key = queryKey(query.package.name, query.version);
      const ids = idsByQuery.get(key) ?? new Set<string>();
      if (result.vulns !== undefined && !Array.isArray(result.vulns)) {
        throw new Error(`OSV returned malformed vulnerabilities for ${key}`);
      }
      for (const vulnerability of result.vulns ?? []) {
        if (
          vulnerability === null ||
          typeof vulnerability !== 'object' ||
          typeof vulnerability.id !== 'string' ||
          vulnerability.id.length === 0
        ) {
          throw new Error(
            `OSV returned a malformed vulnerability ID for ${key}`,
          );
        }
        ids.add(vulnerability.id);
      }
      idsByQuery.set(key, ids);
      if (result.next_page_token !== undefined) {
        if (
          typeof result.next_page_token !== 'string' ||
          result.next_page_token.length === 0
        ) {
          throw new Error(`OSV returned an invalid page token for ${key}`);
        }
        next.push({ ...query, page_token: result.next_page_token });
      }
    }
    pending = next;
  }
  return idsByQuery;
}

function parseVulnerability(
  value: unknown,
  expectedId: string,
): OsvVulnerability {
  if (
    value === null ||
    typeof value !== 'object' ||
    !('id' in value) ||
    typeof value.id !== 'string' ||
    value.id !== expectedId
  ) {
    throw new Error(`OSV returned malformed details for ${expectedId}`);
  }
  return value as OsvVulnerability;
}

async function fetchDetails(
  ids: Set<string>,
): Promise<Map<string, OsvVulnerability>> {
  const detailMap = new Map<string, OsvVulnerability>();
  const allIds = [...ids];
  for (let offset = 0; offset < allIds.length; offset += DETAILS_CONCURRENCY) {
    const chunk = allIds.slice(offset, offset + DETAILS_CONCURRENCY);
    const details = await Promise.all(
      chunk.map(async (id) => {
        const value = await fetchJson(
          `https://api.osv.dev/v1/vulns/${encodeURIComponent(id)}`,
        );
        return parseVulnerability(value, id);
      }),
    );
    for (const detail of details) {
      detailMap.set(detail.id, detail);
    }
  }
  return detailMap;
}

function severityFromLabel(label: string | undefined): Severity | undefined {
  switch (label?.toLowerCase()) {
    case 'low':
      return 'low';
    case 'medium':
    case 'moderate':
      return 'moderate';
    case 'high':
      return 'high';
    case 'critical':
      return 'critical';
    default:
      return undefined;
  }
}

function severityFromScore(score: number): Severity {
  if (score >= 9) return 'critical';
  if (score >= 7) return 'high';
  if (score >= 4) return 'moderate';
  return 'low';
}

function cvssRoundUp(score: number): number {
  return Math.ceil((score - Number.EPSILON) * 10) / 10;
}

function cvssV3Score(vector: string): number | undefined {
  if (!vector.startsWith('CVSS:3.')) return undefined;
  const metrics = new Map(
    vector
      .split('/')
      .slice(1)
      .map((component) => component.split(':') as [string, string]),
  );
  const av = { N: 0.85, A: 0.62, L: 0.55, P: 0.2 }[metrics.get('AV') ?? ''];
  const ac = { L: 0.77, H: 0.44 }[metrics.get('AC') ?? ''];
  const scope = metrics.get('S');
  const pr =
    scope === 'C'
      ? { N: 0.85, L: 0.68, H: 0.5 }[metrics.get('PR') ?? '']
      : { N: 0.85, L: 0.62, H: 0.27 }[metrics.get('PR') ?? ''];
  const ui = { N: 0.85, R: 0.62 }[metrics.get('UI') ?? ''];
  const confidentiality = { H: 0.56, L: 0.22, N: 0 }[metrics.get('C') ?? ''];
  const integrity = { H: 0.56, L: 0.22, N: 0 }[metrics.get('I') ?? ''];
  const availability = { H: 0.56, L: 0.22, N: 0 }[metrics.get('A') ?? ''];
  if (
    av === undefined ||
    ac === undefined ||
    pr === undefined ||
    ui === undefined ||
    confidentiality === undefined ||
    integrity === undefined ||
    availability === undefined ||
    (scope !== 'U' && scope !== 'C')
  ) {
    return undefined;
  }
  const exploitability = 8.22 * av * ac * pr * ui;
  const impactBase =
    1 - (1 - confidentiality) * (1 - integrity) * (1 - availability);
  const impact =
    scope === 'U'
      ? 6.42 * impactBase
      : 7.52 * (impactBase - 0.029) - 3.25 * (impactBase - 0.02) ** 15;
  if (impact <= 0) return 0;
  return Math.min(
    scope === 'U' ? impact + exploitability : 1.08 * (impact + exploitability),
    10,
  );
}

function extractSeverityValues(
  vulnerability: OsvVulnerability,
  dependency: Dependency,
): { labels: string[]; vectors: OsvSeverity[] } {
  const affected = (vulnerability.affected ?? []).filter(
    (entry) =>
      entry.package?.ecosystem?.toLowerCase() === 'npm' &&
      entry.package.name === dependency.name,
  );
  return {
    labels: [
      vulnerability.database_specific?.severity,
      ...affected.flatMap((entry) => [
        entry.ecosystem_specific?.severity,
        entry.database_specific?.severity,
      ]),
    ].filter((label): label is string => typeof label === 'string'),
    vectors: [
      ...(vulnerability.severity ?? []),
      ...affected.flatMap((entry) => entry.severity ?? []),
    ],
  };
}

export function deriveSeverity(
  vulnerability: OsvVulnerability,
  dependency: Dependency,
): Severity {
  const { labels, vectors } = extractSeverityValues(vulnerability, dependency);
  for (const label of labels) {
    const severity = severityFromLabel(label);
    if (severity !== undefined) return severity;
  }
  for (const item of vectors) {
    if (typeof item.score !== 'string') continue;
    const numeric = Number(item.score);
    if (Number.isFinite(numeric) && numeric >= 0 && numeric <= 10) {
      return severityFromScore(numeric);
    }
    const vectorScore = cvssV3Score(item.score);
    if (vectorScore !== undefined) {
      return severityFromScore(cvssRoundUp(vectorScore));
    }
  }
  if (typeof vulnerability.database_specific?.cvss?.score === 'number') {
    return severityFromScore(vulnerability.database_specific.cvss.score);
  }
  // OSV does not require severity. Treat missing/unknown data conservatively.
  return 'high';
}

function affectedEntries(
  vulnerability: OsvVulnerability,
  dependency: Dependency,
): OsvAffected[] {
  return (vulnerability.affected ?? []).filter(
    (item) =>
      item.package?.ecosystem?.toLowerCase() === 'npm' &&
      item.package.name === dependency.name,
  );
}

export function firstFixedVersion(
  vulnerability: OsvVulnerability,
  dependency: Dependency,
): string | undefined {
  if (semver.valid(dependency.version) === null) return undefined;
  for (const item of affectedEntries(vulnerability, dependency)) {
    for (const range of item.ranges ?? []) {
      if (range.type !== 'ECOSYSTEM' && range.type !== 'SEMVER') continue;
      let active = false;
      for (const event of range.events ?? []) {
        if (event.introduced !== undefined) {
          active =
            event.introduced === '0' ||
            (semver.valid(event.introduced) !== null &&
              semver.gte(dependency.version, event.introduced));
        } else if (event.fixed !== undefined) {
          if (
            active &&
            semver.valid(event.fixed) !== null &&
            semver.lt(dependency.version, event.fixed)
          ) {
            return event.fixed;
          }
          active = false;
        } else if (event.last_affected !== undefined) {
          active = false;
        } else if (event.limit !== undefined) {
          active = false;
        }
      }
    }
  }
  return undefined;
}

export function advisoryIdentifiers(vulnerability: OsvVulnerability): string[] {
  return [...new Set([vulnerability.id, ...(vulnerability.aliases ?? [])])].map(
    (identifier) => identifier.toUpperCase(),
  );
}

export function canonicalAdvisory(vulnerability: OsvVulnerability): string {
  const identifiers = advisoryIdentifiers(vulnerability);
  return (
    identifiers.find((identifier) => identifier.startsWith('GHSA-')) ??
    identifiers.find((identifier) => identifier.startsWith('CVE-')) ??
    identifiers.toSorted((left, right) => left.localeCompare(right))[0] ??
    vulnerability.id
  );
}

export async function scanVulnerabilities(
  dependencies: Dependency[],
): Promise<VulnerabilityFinding[]> {
  const unique = new Map<string, Dependency>();
  for (const dependency of dependencies) {
    unique.set(queryKey(dependency.name, dependency.version), dependency);
  }
  const queries = [...unique.values()].map<BatchQuery>((dependency) => ({
    package: { ecosystem: 'npm', name: dependency.name },
    version: dependency.version,
  }));
  const idsByQuery = new Map<string, Set<string>>();
  for (let offset = 0; offset < queries.length; offset += BATCH_SIZE) {
    const results = await queryBatch(
      queries.slice(offset, offset + BATCH_SIZE),
    );
    for (const [key, ids] of results) idsByQuery.set(key, ids);
  }
  const allIds = new Set([...idsByQuery.values()].flatMap((ids) => [...ids]));
  const details = await fetchDetails(allIds);
  const findings: VulnerabilityFinding[] = [];
  for (const dependency of dependencies) {
    const ids = idsByQuery.get(queryKey(dependency.name, dependency.version));
    if (ids === undefined) {
      throw new Error(
        `OSV scan did not return a result for ${dependency.name}@${dependency.version}`,
      );
    }
    const seenAdvisories = new Set<string>();
    for (const id of ids) {
      const vulnerability = details.get(id);
      if (vulnerability === undefined) {
        throw new Error(`OSV details were not returned for ${id}`);
      }
      if (vulnerability.withdrawn !== undefined) continue;
      const advisory = canonicalAdvisory(vulnerability);
      if (seenAdvisories.has(advisory)) continue;
      seenAdvisories.add(advisory);
      const fixedVersion = firstFixedVersion(vulnerability, dependency);
      findings.push({
        dependency,
        advisory,
        aliases: advisoryIdentifiers(vulnerability),
        summary: vulnerability.summary ?? 'No advisory summary provided',
        severity: deriveSeverity(vulnerability, dependency),
        ...(fixedVersion === undefined ? {} : { fixedVersion }),
      });
    }
  }
  return findings;
}

export function newlyIntroducedVulnerabilities(
  base: VulnerabilityFinding[],
  head: VulnerabilityFinding[],
): VulnerabilityFinding[] {
  const baseOccurrences = new Set(
    base.map(
      (finding) =>
        `${finding.dependency.manifest}\0${finding.dependency.path}\0${finding.dependency.name}\0${finding.dependency.version}\0${finding.dependency.scope}\0${finding.advisory}`,
    ),
  );
  return head.filter(
    (finding) =>
      !baseOccurrences.has(
        `${finding.dependency.manifest}\0${finding.dependency.path}\0${finding.dependency.name}\0${finding.dependency.version}\0${finding.dependency.scope}\0${finding.advisory}`,
      ),
  );
}

/* eslint-enable @checkdigit/require-service-call-response-declaration, @typescript-eslint/no-unnecessary-condition, camelcase, curly, max-depth, no-await-in-loop, no-continue, no-magic-numbers, preserve-caught-error, sonarjs/cognitive-complexity, unicorn/switch-case-braces */
