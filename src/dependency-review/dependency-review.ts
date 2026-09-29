// dependency-review/dependency-review.ts

/* eslint-disable no-magic-numbers */

import {
  error as annotateError,
  getInput,
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
import { renderReport, safeJsonOutput, truncateUtf8 } from './report.ts';
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
    vulnerabilities = filterVulnerabilities(
      newlyIntroducedVulnerabilities(baseFindings, headFindings),
      {
        threshold: configuration.failOnSeverity,
        scopes: configuration.failOnScopes,
        allowedAdvisories: configuration.allowedAdvisories,
      },
    );
  }

  const licenseIssues = configuration.licenseCheck
    ? await checkLicenses(changedDependencies, {
        allowLicenses: configuration.allowLicenses,
        denyLicenses: configuration.denyLicenses,
        allowedDependencies: configuration.allowDependenciesLicenses,
      })
    : [];
  const denied = [
    ...unsupportedSourceDependencies(changedDependencies),
    ...deniedDependencies(
      changedDependencies.filter((dependency) => dependency.source === 'npm'),
      configuration.denyPackages,
      configuration.denyGroups,
    ),
  ];
  const result: ReviewResult = {
    changes,
    vulnerabilities,
    licenseIssues,
    denied,
    scannedFiles: [
      ...baseLockfiles.map((lockfile) => `base:${lockfile.path}`),
      ...headLockfiles.map((lockfile) => `head:${lockfile.path}`),
    ],
  };

  const hasLicensePolicy =
    configuration.allowLicenses.size > 0 || configuration.denyLicenses.size > 0;
  const blockingLicenseIssues = licenseIssues.filter(
    (finding) => finding.reason !== 'unknown' || hasLicensePolicy,
  );
  const failed =
    vulnerabilities.length > 0 ||
    blockingLicenseIssues.length > 0 ||
    denied.length > 0;
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
