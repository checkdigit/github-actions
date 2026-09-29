// dependency-review/policy.ts

/* eslint-disable no-continue */

import type {
  DeniedFinding,
  Dependency,
  Severity,
  VulnerabilityFinding,
} from './types.ts';
import { dependencyMatchesRule } from './licenses.ts';

const severityOrder: Record<Severity, number> = {
  low: 0,
  moderate: 1,
  high: 2,
  critical: 3,
};

export function severityAtLeast(
  actual: Severity,
  threshold: Severity,
): boolean {
  return severityOrder[actual] >= severityOrder[threshold];
}

export function filterVulnerabilities(
  findings: VulnerabilityFinding[],
  options: {
    threshold: Severity;
    scopes: Set<'runtime' | 'development'>;
    allowedAdvisories: Set<string>;
  },
): VulnerabilityFinding[] {
  return findings.filter(
    (finding) =>
      options.scopes.has(finding.dependency.scope) &&
      severityAtLeast(finding.severity, options.threshold) &&
      !finding.aliases.some((identifier) =>
        options.allowedAdvisories.has(identifier.toUpperCase()),
      ),
  );
}

function groupMatches(dependency: Dependency, rule: string): boolean {
  // Remove the npm PURL scheme when a namespace is expressed as a PURL.
  const normalized = rule.toLowerCase().replace(/^pkg:npm\//u, '');
  if (!normalized.startsWith('@') && !normalized.startsWith('%40')) {
    return false;
  }
  let decoded: string;
  try {
    decoded = decodeURIComponent(normalized);
  } catch {
    return false;
  }
  const scope = dependency.name.startsWith('@')
    ? dependency.name.slice(0, dependency.name.indexOf('/'))
    : '';
  // Permit a single trailing slash in namespace rules.
  return decoded.replace(/\/$/u, '') === scope.toLowerCase();
}

export function deniedDependencies(
  dependencies: Dependency[],
  packageRules: string[],
  groupRules: string[],
): DeniedFinding[] {
  const findings: DeniedFinding[] = [];
  for (const dependency of dependencies) {
    const packageRule = packageRules.find((rule) =>
      dependencyMatchesRule(dependency, rule),
    );
    if (packageRule !== undefined) {
      findings.push({ dependency, rule: packageRule, reason: 'policy' });
      continue;
    }
    const groupRule = groupRules.find((rule) => groupMatches(dependency, rule));
    if (groupRule !== undefined) {
      findings.push({ dependency, rule: groupRule, reason: 'policy' });
    }
  }
  return findings;
}

export function unsupportedSourceDependencies(
  dependencies: Dependency[],
): DeniedFinding[] {
  return dependencies
    .filter((dependency) => dependency.source !== 'npm')
    .map((dependency) => ({
      dependency,
      rule: `${dependency.source}:${dependency.resolved ?? 'unknown source'}`,
      reason: 'unsupported-source',
    }));
}

/* eslint-enable no-continue */
