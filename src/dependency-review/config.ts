// dependency-review/config.ts

import { validateLicenseIdentifiers } from './licenses.ts';
import type { Severity } from './types.ts';

export interface Configuration {
  token: string;
  baseRef?: string;
  headRef?: string;
  failOnSeverity: Severity;
  failOnScopes: Set<'runtime' | 'development'>;
  allowedAdvisories: Set<string>;
  vulnerabilityCheck: boolean;
  warnOnly: boolean;
  showPatchedVersions: boolean;
  licenseCheck: boolean;
  allowLicenses: Set<string>;
  denyLicenses: Set<string>;
  allowDependenciesLicenses: string[];
  denyPackages: string[];
  denyGroups: string[];
  commentMode: 'never' | 'on-failure' | 'always';
}

export type InputReader = (name: string) => string;

export function listInput(value: string): string[] {
  // Split GitHub Action list inputs on commas or line breaks.
  const listSeparators = /[\n,]+/u;
  return [
    ...new Set(
      value
        .split(listSeparators)
        .map((item) => item.trim())
        .filter(Boolean),
    ),
  ];
}

function booleanInput(
  value: string,
  name: string,
  defaultValue: boolean,
): boolean {
  if (value === '') {
    return defaultValue;
  }
  if (value.toLowerCase() === 'true') {
    return true;
  }
  if (value.toLowerCase() === 'false') {
    return false;
  }
  throw new Error(`${name} must be true or false`);
}

function severityInput(value: string): Severity {
  const normalized = value === '' ? 'low' : value.toLowerCase();
  if (
    normalized !== 'low' &&
    normalized !== 'moderate' &&
    normalized !== 'high' &&
    normalized !== 'critical'
  ) {
    throw new Error(
      'fail-on-severity must be low, moderate, high, or critical',
    );
  }
  return normalized;
}

export function readConfiguration(getInput: InputReader): Configuration {
  const token = getInput('github-token').trim();
  if (token.length === 0) {
    throw new Error('github-token is required');
  }
  const scopeItems = listInput(getInput('fail-on-scopes') || 'runtime');
  const failOnScopes = new Set<'runtime' | 'development'>();
  for (const scope of scopeItems) {
    if (scope === 'runtime') {
      failOnScopes.add('runtime');
    } else if (scope === 'development' || scope === 'development-only') {
      failOnScopes.add('development');
    } else {
      throw new Error('fail-on-scopes accepts only runtime and development');
    }
  }
  if (failOnScopes.size === 0) {
    throw new Error('fail-on-scopes cannot be empty');
  }

  const allowLicenseItems = listInput(getInput('allow-licenses'));
  const denyLicenseItems = listInput(getInput('deny-licenses'));
  if (allowLicenseItems.length > 0 && denyLicenseItems.length > 0) {
    throw new Error('allow-licenses and deny-licenses are mutually exclusive');
  }
  const commentValue = getInput('comment-summary-in-pr') || 'never';
  if (
    commentValue !== 'never' &&
    commentValue !== 'on-failure' &&
    commentValue !== 'always'
  ) {
    throw new Error(
      'comment-summary-in-pr must be never, on-failure, or always',
    );
  }
  const allowedAdvisories = new Set(
    [
      ...listInput(getInput('allow-advisories')),
      ...listInput(getInput('allow-ghsas')),
    ].map((identifier) => identifier.toUpperCase()),
  );
  // Accept exact advisory IDs from any OSV source while rejecting delimiters/control text.
  const advisoryIdentifier =
    // OSV source IDs are ASCII identifiers such as GHSA-*, CVE-*, MAL-* and ecosystem IDs.
    /^[A-Z0-9][A-Z0-9._:+-]{1,127}$/u;
  for (const identifier of allowedAdvisories) {
    if (!advisoryIdentifier.test(identifier)) {
      throw new Error(`Unsupported advisory identifier: ${identifier}`);
    }
  }

  return {
    token,
    ...(getInput('base-ref').trim()
      ? { baseRef: getInput('base-ref').trim() }
      : {}),
    ...(getInput('head-ref').trim()
      ? { headRef: getInput('head-ref').trim() }
      : {}),
    failOnSeverity: severityInput(getInput('fail-on-severity')),
    failOnScopes,
    allowedAdvisories,
    vulnerabilityCheck: booleanInput(
      getInput('vulnerability-check'),
      'vulnerability-check',
      true,
    ),
    warnOnly: booleanInput(getInput('warn-only'), 'warn-only', false),
    showPatchedVersions: booleanInput(
      getInput('show-patched-versions'),
      'show-patched-versions',
      true,
    ),
    licenseCheck: booleanInput(
      getInput('license-check'),
      'license-check',
      true,
    ),
    allowLicenses: validateLicenseIdentifiers(allowLicenseItems),
    denyLicenses: validateLicenseIdentifiers(denyLicenseItems),
    allowDependenciesLicenses: listInput(
      getInput('allow-dependencies-licenses'),
    ),
    denyPackages: listInput(getInput('deny-packages')),
    denyGroups: listInput(getInput('deny-groups')),
    commentMode: commentValue,
  };
}
