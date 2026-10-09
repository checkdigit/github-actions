// update-dependencies/update-dependencies.ts

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFile, unlink, writeFile } from 'node:fs/promises';

import { getInput, info, setOutput } from '@actions/core';
import { context } from '@actions/github';
import semver from 'semver';

import {
  assertUpdateBranchAvailable,
  completeDependencyIssue,
  getDefaultBranch,
  getExistingDependencyPR,
  publishDependencyComment,
  publishUpdate,
  verifyDefaultBranch,
} from '../github-api/dependency-updates.ts';
import {
  getDependencyClient,
  getDependencyRepo,
} from '../github-api/dependency-client.ts';

import { authorizeComment } from '../github-api/dependency-issue-command.ts';

import { type Scope, selectVersion } from './versions.ts';

interface Manifest {
  version: string;
  workspaces?: unknown;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
}

const execute = promisify(execFile);

// Commas and whitespace separate package names, reviewers, and script names.
const SEPARATOR = /[\s,]+/u;
// Only plain stable versions with an optional caret or tilde are supported.
const VERSION_SPEC = /^[~^]?\d+\.\d+\.\d+$/u;
// Capture JSON indentation so manifest formatting is retained.
const INDENTATION = /^(?<indent>[\t ]+)"/mu;
// npm script names, passed as a single argument rather than shell code.
const SCRIPT_NAME = /^[\w:.-]+$/u;

async function command(program: string, arguments_: string[]): Promise<string> {
  try {
    const { stdout } = await execute(program, arguments_, {
      encoding: 'utf8',
      maxBuffer: 32 * 1024 * 1024,
    });
    return stdout.trim();
  } catch (error) {
    const failure = error as Error & { stdout?: string; stderr?: string };
    if (failure.stdout !== undefined && failure.stdout !== '') {
      info(failure.stdout);
    }
    if (failure.stderr !== undefined && failure.stderr !== '') {
      info(failure.stderr);
    }
    throw error;
  }
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

export default async function main(): Promise<void> {
  if (context.eventName !== 'issue_comment') {
    throw new Error('This action requires an issue comment.');
  }
  const api = getDependencyClient();
  const repo = await getDependencyRepo();
  const issueNumber = await authorizeComment(
    api,
    repo,
    context.payload as unknown as Parameters<typeof authorizeComment>[2],
    getInput('command') || '/update-dependencies',
  );
  if (issueNumber === undefined) {
    info('Ignoring unrelated or unauthorized comment.');
    return;
  }
  const scope = getInput('scope') || 'minor';
  if (scope !== 'patch' && scope !== 'minor' && scope !== 'latest') {
    throw new Error('scope must be patch, minor, or latest');
  }
  const base = await getDefaultBranch(api, repo);
  const existing = await getExistingDependencyPR(api, repo);
  if (existing !== undefined) {
    info(`Existing update PR: ${existing}`);
    setOutput('pull-request-url', existing);
    await publishDependencyComment(
      api,
      repo,
      issueNumber,
      `An update PR already exists: ${existing}`,
    );
    return;
  }
  await assertUpdateBranchAvailable(api, repo);
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
    await completeDependencyIssue(api, repo, issueNumber);
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
  await verifyDefaultBranch(api, repo, base, head);
  await publishUpdate(
    api,
    repo,
    base,
    head,
    manifest.version,
    changes,
    scripts,
    { scope, issueNumber, label: getInput('label') || 'PATCH' },
  );
}
