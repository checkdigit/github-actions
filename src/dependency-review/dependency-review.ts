// dependency-review/dependency-review.ts

/* eslint-disable no-magic-numbers */

import {
  error as annotateError,
  getInput,
  info,
  setOutput,
  summary,
  warning,
} from '@actions/core';

import { readConfiguration } from './config.ts';
import { diffDependencies } from './diff.ts';
import {
  buildInventory,
  createOctokit,
  fetchLockfiles,
  loadRepositoryContext,
  resolveRevisions,
  upsertPullRequestComment,
} from './github.ts';
import { checkLicenses } from './licenses.ts';
import { newlyIntroducedVulnerabilities, scanVulnerabilities } from './osv.ts';
import {
  deniedDependencies,
  filterVulnerabilities,
  unsupportedSourceDependencies,
} from './policy.ts';
import {
  renderReport,
  safeJsonOutput,
  statisticsLogLines,
  truncateUtf8,
} from './report.ts';
import type { Dependency, ReviewAnnotation, ReviewResult } from './types.ts';

function changedHeadDependencies(
  changes: ReturnType<typeof diffDependencies>,
  head: Dependency[],
): Dependency[] {
  const locations = new Set(
    changes
      .filter((change) => change.changeType !== 'removed')
      .map((change) => `${change.manifest}\0${change.path}`),
  );
  return head.filter((dependency) =>
    locations.has(`${dependency.manifest}\0${dependency.path}`),
  );
}

function uniquePackageVersions(dependencies: Dependency[]): number {
  return new Set(
    dependencies.map(
      (dependency) => `${dependency.name}\0${dependency.version}`,
    ),
  ).size;
}

export function buildAnnotations(
  result: Pick<ReviewResult, 'vulnerabilities' | 'licenseIssues' | 'denied'>,
  hasLicensePolicy: boolean,
  warnOnly: boolean,
): ReviewAnnotation[] {
  const blockingLevel: ReviewAnnotation['level'] = warnOnly
    ? 'warning'
    : 'error';
  return [
    ...result.vulnerabilities.map((finding) => ({
      level: blockingLevel,
      message: `${finding.advisory}: ${finding.dependency.name}@${finding.dependency.version} has ${finding.severity} severity`,
      file: finding.dependency.manifest,
    })),
    ...result.licenseIssues.map((finding) => ({
      level:
        finding.reason === 'unknown' && !hasLicensePolicy
          ? ('warning' as const)
          : blockingLevel,
      message: `${finding.dependency.name}@${finding.dependency.version} license is ${finding.reason}: ${finding.license ?? 'unknown'}`,
      file: finding.dependency.manifest,
    })),
    ...result.denied.map((finding) => ({
      level: blockingLevel,
      message:
        finding.reason === 'unsupported-source'
          ? `${finding.dependency.name}@${finding.dependency.version} uses unsupported ${finding.rule}; OSV and npm license policy cannot verify it`
          : `${finding.dependency.name}@${finding.dependency.version} is denied by ${finding.rule}`,
      file: finding.dependency.manifest,
    })),
  ];
}

export default async function main(): Promise<void> {
  const configuration = readConfiguration(getInput);
  const context = await loadRepositoryContext();
  const revisions = resolveRevisions(
    context,
    configuration.baseRef,
    configuration.headRef,
  );
  const octokit = createOctokit(configuration.token);
  const [baseLockfiles, headLockfiles] = await Promise.all([
    fetchLockfiles(octokit, context, revisions.base),
    fetchLockfiles(octokit, context, revisions.head),
  ]);
  if (baseLockfiles.length === 0 && headLockfiles.length === 0) {
    throw new Error(
      'No supported package-lock.json files were found at either revision',
    );
  }
  const baseDependencies = buildInventory(baseLockfiles);
  const headDependencies = buildInventory(headLockfiles);
  const changes = diffDependencies(baseDependencies, headDependencies);
  const changedDependencies = changedHeadDependencies(
    changes,
    headDependencies,
  );

  let vulnerabilities: ReviewResult['vulnerabilities'] = [];
  let osvQueries = 0;
  let baseVulnerabilityFindings = 0;
  let headVulnerabilityFindings = 0;
  let introducedVulnerabilityFindings = 0;
  if (configuration.vulnerabilityCheck) {
    const baseNpmDependencies = baseDependencies.filter(
      (dependency) => dependency.source === 'npm',
    );
    const headNpmDependencies = headDependencies.filter(
      (dependency) => dependency.source === 'npm',
    );
    const [baseFindings, headFindings] = await Promise.all([
      scanVulnerabilities(baseNpmDependencies),
      scanVulnerabilities(headNpmDependencies),
    ]);
    osvQueries =
      uniquePackageVersions(baseNpmDependencies) +
      uniquePackageVersions(headNpmDependencies);
    baseVulnerabilityFindings = baseFindings.length;
    headVulnerabilityFindings = headFindings.length;
    const introducedFindings = newlyIntroducedVulnerabilities(
      baseFindings,
      headFindings,
    );
    introducedVulnerabilityFindings = introducedFindings.length;
    vulnerabilities = filterVulnerabilities(introducedFindings, {
      threshold: configuration.failOnSeverity,
      scopes: configuration.failOnScopes,
      allowedAdvisories: configuration.allowedAdvisories,
    });
  }

  const licenseIssues = configuration.licenseCheck
    ? await checkLicenses(changedDependencies, {
        allowLicenses: configuration.allowLicenses,
        denyLicenses: configuration.denyLicenses,
        allowedDependencies: configuration.allowDependenciesLicenses,
      })
    : [];
  const unsupportedSources = unsupportedSourceDependencies(changedDependencies);
  const policyDenied = deniedDependencies(
    changedDependencies.filter((dependency) => dependency.source === 'npm'),
    configuration.denyPackages,
    configuration.denyGroups,
  );
  const denied = [...unsupportedSources, ...policyDenied];

  const hasLicensePolicy =
    configuration.allowLicenses.size > 0 || configuration.denyLicenses.size > 0;
  const blockingLicenseIssues = licenseIssues.filter(
    (finding) => finding.reason !== 'unknown' || hasLicensePolicy,
  );
  const failed =
    vulnerabilities.length > 0 ||
    blockingLicenseIssues.length > 0 ||
    denied.length > 0;
  const result: ReviewResult = {
    changes,
    vulnerabilities,
    licenseIssues,
    denied,
    scannedFiles: [
      ...baseLockfiles.map((lockfile) => `base:${lockfile.path}`),
      ...headLockfiles.map((lockfile) => `head:${lockfile.path}`),
    ],
    statistics: {
      lockfiles: { base: baseLockfiles.length, head: headLockfiles.length },
      dependencyOccurrences: {
        base: baseDependencies.length,
        head: headDependencies.length,
      },
      changes: {
        added: changes.filter((change) => change.changeType === 'added').length,
        changed: changes.filter((change) => change.changeType === 'changed')
          .length,
        removed: changes.filter((change) => change.changeType === 'removed')
          .length,
        runtime: changes.filter((change) => change.scope === 'runtime').length,
        development: changes.filter((change) => change.scope === 'development')
          .length,
      },
      vulnerabilities: {
        enabled: configuration.vulnerabilityCheck,
        osvQueries,
        baseFindings: baseVulnerabilityFindings,
        headFindings: headVulnerabilityFindings,
        introduced: introducedVulnerabilityFindings,
        policyMatching: vulnerabilities.length,
      },
      licenses: {
        enabled: configuration.licenseCheck,
        candidates: configuration.licenseCheck
          ? changedDependencies.filter(
              (dependency) => dependency.source === 'npm',
            ).length
          : 0,
        issues: licenseIssues.length,
        blockingIssues: blockingLicenseIssues.length,
      },
      policy: {
        denied: policyDenied.length,
        unsupportedSources: unsupportedSources.length,
      },
      blockingFindings:
        vulnerabilities.length + blockingLicenseIssues.length + denied.length,
    },
  };
  info('Dependency review statistics:');
  for (const line of statisticsLogLines(result.statistics)) {
    info(line);
  }
  for (const annotation of buildAnnotations(
    result,
    hasLicensePolicy,
    configuration.warnOnly,
  )) {
    if (annotation.level === 'warning') {
      warning(annotation.message, { file: annotation.file });
    } else {
      annotateError(annotation.message, { file: annotation.file });
    }
  }

  const report = renderReport(result, configuration.showPatchedVersions);
  await summary.addRaw(report).write();
  setOutput(
    'dependency-changes',
    safeJsonOutput(changes, 'dependency-changes'),
  );
  setOutput(
    'vulnerable-changes',
    safeJsonOutput(vulnerabilities, 'vulnerable-changes'),
  );
  setOutput(
    'invalid-license-changes',
    safeJsonOutput(licenseIssues, 'invalid-license-changes'),
  );
  setOutput('denied-changes', safeJsonOutput(denied, 'denied-changes'));
  setOutput('comment-content', truncateUtf8(report, 65_000));

  const shouldComment =
    configuration.commentMode === 'always' ||
    (configuration.commentMode === 'on-failure' && failed);
  if (shouldComment) {
    try {
      await upsertPullRequestComment(
        octokit,
        context,
        truncateUtf8(report, 64_900),
      );
    } catch (commentError) {
      warning(
        `Unable to create or update the dependency review PR comment. Grant pull-requests: write when comments are enabled. ${String(commentError)}`,
      );
    }
  }

  if (failed) {
    const message = `Dependency review found ${vulnerabilities.length} vulnerability issue(s), ${blockingLicenseIssues.length} blocking license issue(s), and ${denied.length} denied package(s)`;
    if (configuration.warnOnly) {
      warning(message);
    } else {
      throw new Error(message);
    }
  }
}

/* eslint-enable no-magic-numbers */
