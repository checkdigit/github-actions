// update-dependencies/update-dependencies.ts

/* eslint-disable camelcase -- GitHub REST API uses snake_case parameter names. */

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFile, unlink, writeFile } from 'node:fs/promises';

import { getInput, info, setOutput, summary } from '@actions/core';
import { context, getOctokit } from '@actions/github';
import semver from 'semver';

import { type Scope, selectVersion } from './versions.ts';

interface Manifest {
  version: string;
  workspaces?: unknown;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
}

const execute = promisify(execFile);
const NOT_FOUND = 404;
const TEAM_PREFIX = 'team:';
// Commas and whitespace separate package names, reviewers, and script names.
const SEPARATOR = /[\s,]+/u;
// Only plain stable versions with an optional caret or tilde are supported.
const VERSION_SPEC = /^[~^]?\d+\.\d+\.\d+$/u;
// Capture JSON indentation so manifest formatting is retained.
const INDENTATION = /^(?<indent>[\t ]+)"/mu;
// npm script names, passed as a single argument rather than shell code.
const SCRIPT_NAME = /^[\w:.-]+$/u;

async function command(program: string, arguments_: string[]): Promise<string> {
  const { stdout } = await execute(program, arguments_, {
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
  });
  return stdout.trim();
}

async function updateManifest(
  manifest: Manifest,
  selected: string[],
  scope: Scope,
): Promise<string[]> {
  const changes: string[] = [];
  const found = new Set<string>();
  for (const section of [
    'dependencies',
    'devDependencies',
    'optionalDependencies',
  ] as const) {
    const dependencies = manifest[section];
    const entries = Object.entries(dependencies ?? {}).filter(
      ([name]) => selected.length === 0 || selected.includes(name),
    );
    for (const [name, spec] of entries) {
      found.add(name);
      if (VERSION_SPEC.test(spec)) {
        const result = JSON.parse(
          // eslint-disable-next-line no-await-in-loop -- Query registries sequentially to limit request load.
          await command('npm', ['view', name, 'versions', '--json']),
        ) as string[] | string;
        const next = selectVersion(
          spec,
          Array.isArray(result) ? result : [result],
          scope,
        );
        if (next !== undefined && dependencies !== undefined) {
          dependencies[name] = next;
          changes.push(`- ${name} (${section}): ${spec} → ${next}`);
        }
      } else {
        info(`Skipping unsupported dependency spec: ${name}@${spec}`);
        if (selected.includes(name)) {
          throw new Error(
            `Unsupported version spec for selected package ${name}: ${spec}`,
          );
        }
      }
    }
  }
  for (const name of selected) {
    if (!found.has(name)) {
      throw new Error(`Selected package ${name} is not a direct dependency.`);
    }
  }
  return changes;
}

export async function publishUpdate(
  api: ReturnType<typeof getOctokit>,
  repo: { owner: string; repo: string },
  base: string,
  head: string,
  version: string,
  changes: string[],
  scripts: string[],
  scope: Scope,
): Promise<void> {
  const branch = 'automation/dependency-updates';
  // Resolve the label before creating the issue or branch.
  const label = getInput('label') || 'PATCH';
  await api.rest.issues.getLabel({ ...repo, name: label });
  const reviewers = getInput('reviewers').split(SEPARATOR).filter(Boolean);
  const users = reviewers.filter((reviewer) => !reviewer.startsWith('team:'));
  const teams = reviewers
    .filter((reviewer) => reviewer.startsWith('team:'))
    .map((reviewer) => reviewer.slice(TEAM_PREFIX.length));
  const title = `Update dependencies (${version})`;
  const details = `${changes.join('\n')}\n\nValidation: ${scripts.join(', ')}.\nScope: ${scope}. Peer dependencies are unchanged.\nLockfile regenerated; transitive dependencies may also change.`;
  const { data: issue } = await api.rest.issues.create({
    ...repo,
    title,
    body: details,
  });
  await api.rest.git.createRef({
    ...repo,
    ref: `refs/heads/${branch}`,
    sha: head,
  });
  // GitHub signs API-created bot commits; do not supply custom identity/signature.
  const result = await api.graphql<{
    createCommitOnBranch: { commit: { oid: string } };
  }>(
    `mutation($input: CreateCommitOnBranchInput!) {
      createCommitOnBranch(input: $input) { commit { oid } }
    }`,
    {
      input: {
        branch: {
          repositoryNameWithOwner: `${repo.owner}/${repo.repo}`,
          branchName: branch,
        },
        expectedHeadOid: head,
        message: { headline: title, body: `Refs #${issue.number}` },
        fileChanges: {
          additions: await Promise.all(
            ['package.json', 'package-lock.json'].map(async (file) => ({
              path: file,
              contents: Buffer.from(await readFile(file)).toString('base64'),
            })),
          ),
        },
      },
    },
  );
  const { data: commit } = await api.rest.repos.getCommit({
    ...repo,
    ref: result.createCommitOnBranch.commit.oid,
  });
  if (commit.commit.verification?.verified !== true) {
    throw new Error(
      `Commit is not verified. Inspect ${branch} and issue #${issue.number}; no PR was opened.`,
    );
  }
  const { data: pull } = await api.rest.pulls.create({
    ...repo,
    head: branch,
    base,
    title,
    body: `Closes #${issue.number}\n\n${details}\n\nReview, squash merge, and release manually.`,
  });
  await api.rest.issues.addLabels({
    ...repo,
    issue_number: pull.number,
    labels: [label],
  });
  if (users.length > 0 || teams.length > 0) {
    await api.rest.pulls.requestReviewers({
      ...repo,
      pull_number: pull.number,
      reviewers: users,
      team_reviewers: teams,
    });
  }
  setOutput('issue-url', issue.html_url);
  setOutput('pull-request-url', pull.html_url);
  await summary
    .addLink('Dependency update PR', pull.html_url)
    .addRaw(`\n\n${details}\n`)
    .write();
}

export default async function main(): Promise<void> {
  const scope = getInput('scope') || 'minor';
  if (scope !== 'patch' && scope !== 'minor' && scope !== 'latest') {
    throw new Error('scope must be patch, minor, or latest');
  }
  const api = getOctokit(getInput('github-token', { required: true }));
  const repo = context.repo;
  const { data: repo_ } = await api.rest.repos.get(repo);
  const base = repo_.default_branch;
  const branch = 'automation/dependency-updates';
  const { data: pulls } = await api.rest.pulls.list({
    ...repo,
    state: 'open',
    head: `${repo.owner}:${branch}`,
  });
  if (pulls.length > 0) {
    info(`Existing update PR: ${pulls[0]?.html_url}`);
    setOutput('pull-request-url', pulls[0]?.html_url);
    return;
  }
  try {
    await api.rest.git.getRef({ ...repo, ref: `heads/${branch}` });
    throw new Error(
      `Delete the stale ${branch} branch before starting another update.`,
    );
  } catch (error) {
    if ((error as { status?: number }).status !== NOT_FOUND) {
      throw error;
    }
  }
  const original = await readFile('package.json', 'utf8');
  const manifest = JSON.parse(original) as Manifest;
  if (manifest.workspaces !== undefined) {
    throw new Error('npm workspaces are not supported by this action.');
  }
  if (
    semver.valid(manifest.version) === null ||
    semver.prerelease(manifest.version) !== null
  ) {
    throw new Error('The package must have a stable semantic version.');
  }
  if ((await command('git', ['status', '--porcelain'])) !== '') {
    throw new Error('The checkout must be clean.');
  }
  const head = await command('git', ['rev-parse', 'HEAD']);
  const selected = getInput('packages').split(SEPARATOR).filter(Boolean);
  const changes = await updateManifest(manifest, selected, scope);
  if (changes.length === 0) {
    info('No eligible direct dependency updates.');
    return;
  }
  manifest.version = semver.inc(manifest.version, 'patch') ?? manifest.version;
  const indentation = INDENTATION.exec(original)?.groups?.['indent'] ?? '  ';
  await writeFile(
    'package.json',
    `${JSON.stringify(manifest, undefined, indentation)}\n`,
  );
  await unlink('package-lock.json');
  await command('npm', ['install', '--package-lock-only', '--ignore-scripts']);
  await command('npm', ['ci', '--ignore-scripts']);
  const scripts = getInput('validation-scripts', { required: true })
    .split(SEPARATOR)
    .filter(Boolean);
  if (scripts.length === 0) {
    throw new Error('At least one validation script is required.');
  }
  for (const script of scripts) {
    if (!SCRIPT_NAME.test(script)) {
      throw new Error(`Invalid npm script: ${script}`);
    }
    info(`Running npm run ${script}`);
    // eslint-disable-next-line no-await-in-loop -- Validation scripts must run in order.
    info(await command('npm', ['run', script]));
  }
  const lock = JSON.parse(await readFile('package-lock.json', 'utf8')) as {
    version: string;
    packages: Record<string, { version: string }>;
  };
  if (
    lock.version !== manifest.version ||
    lock.packages['']?.version !== manifest.version
  ) {
    throw new Error('Package and lockfile versions disagree.');
  }
  const diff = await command('git', ['diff', '--name-only']);
  const changed = diff.split('\n');
  if (
    changed.some(
      (file) => file !== 'package.json' && file !== 'package-lock.json',
    )
  ) {
    throw new Error('Validation modified files outside the package manifests.');
  }
  const { data: baseReference } = await api.rest.git.getRef({
    ...repo,
    ref: `heads/${base}`,
  });
  if (baseReference.object.sha !== head) {
    throw new Error('The default branch changed during validation. Run again.');
  }
  await publishUpdate(
    api,
    repo,
    base,
    head,
    manifest.version,
    changes,
    scripts,
    scope,
  );
}

/* eslint-enable camelcase */
