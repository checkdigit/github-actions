// update-dependencies/update-dependencies.ts

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFile, unlink, writeFile } from 'node:fs/promises';

import { getInput, info, setOutput } from '@actions/core';
import { context } from '@actions/github';
import semver from 'semver';

import {
  assertUpdateBranchAvailable,
  getDefaultBranch,
  getExistingDependencyPR,
  publishDependencyComment,
  publishUpdate,
  verifyDefaultBranch,
} from './publish.ts';
import { getDependencyClient, getDependencyRepo } from './client.ts';

import { authorizeComment } from './issue-command.ts';

interface Manifest {
  version: string;
  workspaces?: unknown;
}

const execute = promisify(execFile);

// Capture JSON indentation so manifest formatting is retained.
const INDENTATION = /^(?<indent>[\t ]+)"/mu;

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

async function bumpPackageVersion(): Promise<string> {
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
  manifest.version = semver.inc(manifest.version, 'patch') ?? manifest.version;
  const indentation = INDENTATION.exec(original)?.groups?.['indent'] ?? '  ';
  await writeFile(
    'package.json',
    `${JSON.stringify(manifest, undefined, indentation)}\n`,
  );
  return manifest.version;
}

async function updateDependencies(): Promise<{
  version: string;
  validationFailures: string[];
}> {
  const version = await bumpPackageVersion();
  info(await command('npx', ['--yes', 'npm-check-updates', '-u']));
  await unlink('package-lock.json');
  info(await command('npm', ['install', '--ignore-scripts']));
  const validationFailures: string[] = [];
  for (const arguments_ of [
    ['run', 'prepare', '--if-present'],
    ['run', 'lint:fix'],
    ['run', 'prettier:fix'],
    ['run', 'test'],
  ]) {
    try {
      // eslint-disable-next-line no-await-in-loop -- Run validation in order and retain fixes even when a step fails.
      info(await command('npm', arguments_));
    } catch {
      const invocation = `npm ${arguments_.join(' ')}`;
      validationFailures.push(invocation);
      info(`${invocation} failed; publishing changes for manual repair.`);
    }
  }
  const lock = JSON.parse(await readFile('package-lock.json', 'utf8')) as {
    version: string;
    packages: Record<string, { version: string }>;
  };
  if (lock.version !== version || lock.packages['']?.version !== version) {
    throw new Error('Package and lockfile versions disagree.');
  }
  return { version, validationFailures };
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
  if ((await command('git', ['status', '--porcelain'])) !== '') {
    throw new Error('The checkout must be clean.');
  }
  const head = await command('git', ['rev-parse', 'HEAD']);
  const { version, validationFailures } = await updateDependencies();
  const changedFiles = await command('git', [
    'ls-files',
    '--modified',
    '--others',
    '--exclude-standard',
    '-z',
  ]);
  const files = changedFiles.split('\0').filter(Boolean);
  await verifyDefaultBranch(api, repo, base, head);
  await publishUpdate(api, repo, base, head, version, files, {
    issueNumber,
    validationFailures,
  });
}
