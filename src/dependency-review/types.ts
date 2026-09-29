// dependency-review/types.ts

export type DependencyScope = 'development' | 'runtime';
export type DependencySource = 'npm' | 'git' | 'remote';

export interface Dependency {
  manifest: string;
  path: string;
  name: string;
  version: string;
  scope: DependencyScope;
  optional: boolean;
  license?: string;
  purl: string;
  source: DependencySource;
  resolved?: string;
}

export interface DependencyChange {
  changeType: 'added' | 'removed' | 'changed';
  manifest: string;
  path: string;
  name: string;
  version: string;
  previousVersion?: string;
  scope: DependencyScope;
  optional: boolean;
  license?: string;
  purl: string;
  source: DependencySource;
  resolved?: string;
}

export interface OsvSeverity {
  type?: string;
  score?: string;
}

export interface OsvEvent {
  introduced?: string;
  fixed?: string;
  last_affected?: string;
  limit?: string;
}

export interface OsvAffected {
  package?: { ecosystem?: string; name?: string };
  ranges?: { type?: string; events?: OsvEvent[] }[];
  severity?: OsvSeverity[];
  ecosystem_specific?: { severity?: string };
  database_specific?: { severity?: string };
}

export interface OsvVulnerability {
  id: string;
  aliases?: string[];
  summary?: string;
  withdrawn?: string;
  severity?: OsvSeverity[];
  affected?: OsvAffected[];
  database_specific?: { severity?: string; cvss?: { score?: number } };
}

export type Severity = 'low' | 'moderate' | 'high' | 'critical';

export interface VulnerabilityFinding {
  dependency: Dependency;
  advisory: string;
  aliases: string[];
  summary: string;
  severity: Severity;
  fixedVersion?: string;
}

export interface LicenseFinding {
  dependency: Dependency;
  license?: string;
  reason: 'denied' | 'not-allowed' | 'unknown' | 'invalid';
  detail?: string;
}

export interface DeniedFinding {
  dependency: Dependency;
  rule: string;
  reason?: 'policy' | 'unsupported-source';
}

export interface ReviewAnnotation {
  level: 'error' | 'warning';
  message: string;
  file: string;
}

export interface ReviewStatistics {
  lockfiles: { base: number; head: number };
  dependencyOccurrences: { base: number; head: number };
  changes: {
    added: number;
    changed: number;
    removed: number;
    runtime: number;
    development: number;
  };
  vulnerabilities: {
    enabled: boolean;
    osvQueries: number;
    baseFindings: number;
    headFindings: number;
    introduced: number;
    policyMatching: number;
  };
  licenses: {
    enabled: boolean;
    candidates: number;
    issues: number;
    blockingIssues: number;
  };
  policy: { denied: number; unsupportedSources: number };
  blockingFindings: number;
}

export interface ReviewResult {
  changes: DependencyChange[];
  vulnerabilities: VulnerabilityFinding[];
  licenseIssues: LicenseFinding[];
  denied: DeniedFinding[];
  scannedFiles: string[];
  statistics: ReviewStatistics;
}
