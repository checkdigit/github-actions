// dependency-review/licenses.ts

/* eslint-disable @checkdigit/no-side-effects, @checkdigit/require-service-call-response-declaration, no-await-in-loop, no-continue, no-magic-numbers, preserve-caught-error, sonarjs/cognitive-complexity */

import parseSpdx, {
  type SpdxConjunctionNode,
  type SpdxNode,
} from 'spdx-expression-parse';

import type { Dependency, LicenseFinding } from './types.ts';

export interface LicensePolicy {
  allowLicenses: Set<string>;
  denyLicenses: Set<string>;
  allowedDependencies: string[];
}

interface RegistryMetadata {
  license?: unknown;
  licenses?: unknown;
}

const registryCache = new Map<string, Promise<string | undefined>>();

function isConjunction(node: SpdxNode): node is SpdxConjunctionNode {
  return 'conjunction' in node;
}

export function parseLicenseExpression(expression: string): SpdxNode {
  try {
    return parseSpdx(expression);
  } catch (error) {
    throw new Error(
      `Invalid SPDX expression ${JSON.stringify(expression)}: ${String(error)}`,
    );
  }
}

function licenseLeaf(node: Exclude<SpdxNode, SpdxConjunctionNode>): string {
  const exceptionSuffix =
    node.exception === undefined ? '' : ` WITH ${node.exception}`;
  return `${node.license}${node.plus === true ? '+' : ''}${exceptionSuffix}`;
}

export function validateLicenseIdentifiers(identifiers: string[]): Set<string> {
  const result = new Set<string>();
  for (const identifier of identifiers) {
    const node = parseLicenseExpression(identifier);
    if (isConjunction(node)) {
      throw new Error(
        `License policy entry ${JSON.stringify(identifier)} must be one SPDX license leaf rather than an AND/OR expression`,
      );
    }
    result.add(licenseLeaf(node));
  }
  return result;
}

function allowedByExpression(node: SpdxNode, allowed: Set<string>): boolean {
  if (!isConjunction(node)) {
    return allowed.has(licenseLeaf(node));
  }
  return node.conjunction === 'and'
    ? allowedByExpression(node.left, allowed) &&
        allowedByExpression(node.right, allowed)
    : allowedByExpression(node.left, allowed) ||
        allowedByExpression(node.right, allowed);
}

function deniedByExpression(node: SpdxNode, denied: Set<string>): boolean {
  if (!isConjunction(node)) {
    return denied.has(licenseLeaf(node));
  }
  return node.conjunction === 'and'
    ? deniedByExpression(node.left, denied) ||
        deniedByExpression(node.right, denied)
    : deniedByExpression(node.left, denied) &&
        deniedByExpression(node.right, denied);
}

function decodePurlName(
  rule: string,
): { name: string; version?: string } | undefined {
  if (!rule.toLowerCase().startsWith('pkg:npm/')) {
    return undefined;
  }
  // Strip optional package URL qualifiers and fragments.
  const value = rule.slice('pkg:npm/'.length).split(/[?#]/u)[0];
  if (value === undefined || value.length === 0) {
    return undefined;
  }
  const at = value.lastIndexOf('@');
  const encodedName = at > 0 ? value.slice(0, at) : value;
  const version = at > 0 ? value.slice(at + 1) : undefined;
  try {
    return {
      name: encodedName
        .split('/')
        .map((part) => decodeURIComponent(part))
        .join('/'),
      ...(version === undefined
        ? {}
        : { version: decodeURIComponent(version) }),
    };
  } catch {
    return undefined;
  }
}

export function dependencyMatchesRule(
  dependency: Dependency,
  rule: string,
): boolean {
  const parsed = decodePurlName(rule);
  if (parsed !== undefined) {
    return (
      parsed.name.toLowerCase() === dependency.name.toLowerCase() &&
      (parsed.version === undefined || parsed.version === dependency.version)
    );
  }
  const at = rule.startsWith('@') ? rule.lastIndexOf('@') : rule.indexOf('@');
  const hasVersion = at > 0;
  const name = hasVersion ? rule.slice(0, at) : rule;
  const version = hasVersion ? rule.slice(at + 1) : undefined;
  return (
    name.toLowerCase() === dependency.name.toLowerCase() &&
    (version === undefined || version === dependency.version)
  );
}

function licenseFromRegistryValue(value: unknown): string | undefined {
  if (typeof value === 'string' && value.trim().length > 0) {
    return value.trim();
  }
  if (
    value !== null &&
    typeof value === 'object' &&
    'type' in value &&
    typeof value.type === 'string' &&
    value.type.trim().length > 0
  ) {
    return value.type.trim();
  }
  return undefined;
}

async function fetchRegistryLicense(
  dependency: Dependency,
): Promise<string | undefined> {
  const key = `${dependency.name}\0${dependency.version}`;
  const cached = registryCache.get(key);
  if (cached !== undefined) {
    return cached;
  }
  const request = (async () => {
    let response: Response;
    try {
      response = await fetch(
        `https://registry.npmjs.org/${encodeURIComponent(dependency.name)}/${encodeURIComponent(dependency.version)}`,
        {
          headers: {
            accept: 'application/vnd.npm.install-v1+json, application/json',
            'user-agent': 'checkdigit-dependency-review-action',
          },
          signal: AbortSignal.timeout(30_000),
        },
      );
    } catch (error) {
      throw new Error(
        `npm registry request failed for ${dependency.name}@${dependency.version}: ${String(error)}`,
      );
    }
    if (
      response.status === 401 ||
      response.status === 403 ||
      response.status === 404
    ) {
      return;
    }
    if (!response.ok) {
      throw new Error(
        `npm registry request failed for ${dependency.name}@${dependency.version} with HTTP ${response.status}`,
      );
    }
    let metadata: RegistryMetadata;
    try {
      metadata = (await response.json()) as RegistryMetadata;
    } catch (error) {
      throw new Error(
        `npm registry returned invalid JSON for ${dependency.name}@${dependency.version}: ${String(error)}`,
      );
    }
    return (
      licenseFromRegistryValue(metadata.license) ??
      (Array.isArray(metadata.licenses)
        ? metadata.licenses
            .map(licenseFromRegistryValue)
            .filter((license): license is string => license !== undefined)
            .join(' OR ') || undefined
        : undefined)
    );
  })();
  registryCache.set(key, request);
  return request;
}

export async function checkLicenses(
  dependencies: Dependency[],
  policy: LicensePolicy,
): Promise<LicenseFinding[]> {
  if (policy.allowLicenses.size > 0 && policy.denyLicenses.size > 0) {
    throw new Error('allow-licenses and deny-licenses are mutually exclusive');
  }
  const findings: LicenseFinding[] = [];
  const hasPolicy =
    policy.allowLicenses.size > 0 || policy.denyLicenses.size > 0;
  for (const dependency of dependencies) {
    if (
      policy.allowedDependencies.some((rule) =>
        dependencyMatchesRule(dependency, rule),
      )
    ) {
      continue;
    }
    if (dependency.source !== 'npm') {
      continue;
    }
    // Registry lookups are intentionally anonymous. No npm token is accepted or forwarded.
    let registryLicense: string | undefined;
    try {
      registryLicense = await fetchRegistryLicense(dependency);
    } catch (error) {
      if (hasPolicy) {
        throw error;
      }
      registryLicense = undefined;
    }
    const fallbackLicense = hasPolicy ? undefined : dependency.license;
    const license = registryLicense ?? fallbackLicense;
    if (license === undefined) {
      findings.push({
        dependency,
        reason: 'unknown',
        detail:
          hasPolicy && dependency.license !== undefined
            ? 'Authoritative license metadata was unavailable anonymously from the public npm registry; package-lock.json license data is not trusted for policy enforcement. Private packages should be explicitly excepted with allow-dependencies-licenses after review'
            : 'No authoritative license was available anonymously from the public npm registry and no package-lock.json fallback was available; private packages should be explicitly excepted with allow-dependencies-licenses after review',
      });
      continue;
    }
    let expression: SpdxNode;
    try {
      expression = parseLicenseExpression(license);
    } catch (error) {
      findings.push({
        dependency,
        license,
        reason: 'invalid',
        detail: String(error),
      });
      continue;
    }
    if (
      policy.allowLicenses.size > 0 &&
      !allowedByExpression(expression, policy.allowLicenses)
    ) {
      findings.push({ dependency, license, reason: 'not-allowed' });
    } else if (
      policy.denyLicenses.size > 0 &&
      deniedByExpression(expression, policy.denyLicenses)
    ) {
      findings.push({ dependency, license, reason: 'denied' });
    }
  }
  return findings;
}

export function clearRegistryCache(): void {
  registryCache.clear();
}

/* eslint-enable @checkdigit/no-side-effects, @checkdigit/require-service-call-response-declaration, no-await-in-loop, no-continue, no-magic-numbers, preserve-caught-error, sonarjs/cognitive-complexity */
