// update-dependencies/update-dependencies.ts

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFile, unlink, writeFile } from 'node:fs/promises';

import { endGroup, getInput, info, setOutput, startGroup } from '@actions/core';
import { context } from '@actions/github';
import semver from 'semver';
import debug from 'debug';

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
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
  scripts?: Record<string, string>;
}

const execute = promisify(execFile);
const log = debug('github-actions:update-dependencies');

// Capture JSON indentation so manifest formatting is retained.
const INDENTATION = /^(?<indent>[\t ]+)"/mu;

const SCRIPT_TOKEN =
  // Tokenize shell quotes, escapes, command separators, whitespace, and bare words.
  /'[^']*'|"(?:\\.|[^"\\])*"|\\.|[&|;()\n]|\s|[^\s'"\\&|;()]+/gu;
// Recognize an npx rimraf invocation, including its optional confirmation flag.
const NPX_RIMRAF = /^npx\s+(?:--yes\s+)?rimraf(?=\s|$)/u;
const OBSOLETE_NODE_OPTION =
  // Remove obsolete flags, supporting both space-separated and equals values.
  /^(?:--experimental-strip-types|--disable-warning[=\t ]+(?:ExperimentalWarning|'ExperimentalWarning'|"ExperimentalWarning"))(?=\s|$)[\t ]*/u;
const REMOVE_PATHS = `node -e "process.argv.slice(1).forEach((path) => require('node:fs').rmSync(path, { recursive: true, force: true }))" --`;

function missingDeprecationFlags(arguments_: string): string[] {
  const flags = new Set(['--throw-deprecation', '--pending-deprecation']);
  for (const [token] of arguments_.matchAll(SCRIPT_TOKEN)) {
    if ('&|;()\n'.includes(token)) {
      break;
    }
    flags.delete(token);
  }
  return [...flags];
}

function migrateScript(name: string, script: string): string {
  let isCommandStart = true;
  let skipUntil = 0;
  return script.replaceAll(SCRIPT_TOKEN, (token: string, offset: number) => {
    if (offset < skipUntil) {
      return '';
    }
    if (token !== '\n' && token.trim() === '') {
      return token;
    }
    if (token.startsWith('--')) {
      const obsolete = OBSOLETE_NODE_OPTION.exec(script.slice(offset));
      if (obsolete !== null) {
        skipUntil = offset + obsolete[0].length;
        return '';
      }
    }
    if ('&|;()\n'.includes(token)) {
      isCommandStart = true;
      return token;
    }
    if (isCommandStart && token === 'node' && name === 'ci:test') {
      isCommandStart = false;
      return [
        token,
        ...missingDeprecationFlags(script.slice(offset + token.length)),
      ].join(' ');
    }
    if (isCommandStart && token === 'npx') {
      const invocation = NPX_RIMRAF.exec(script.slice(offset));
      if (invocation !== null) {
        skipUntil = offset + invocation[0].length;
        isCommandStart = false;
        return REMOVE_PATHS;
      }
    }
    const shouldReplace = isCommandStart && token === 'rimraf';
    isCommandStart = false;
    return shouldReplace ? REMOVE_PATHS : token;
  });
}

function migrateDependencies(manifest: Manifest): void {
  for (const dependencies of [
    manifest.dependencies ?? {},
    manifest.devDependencies ?? {},
    manifest.optionalDependencies ?? {},
    manifest.peerDependencies ?? {},
  ]) {
    delete dependencies['rimraf'];
    delete dependencies['@types/koa__router'];
  }
  const scripts = manifest.scripts;
  if (scripts === undefined) {
    return;
  }
  for (const [name, script] of Object.entries(scripts)) {
    scripts[name] = migrateScript(name, script);
  }
}

async function command(program: string, arguments_: string[]): Promise<string> {
  try {
    const { stdout, stderr } = await execute(program, arguments_, {
      encoding: 'utf8',
      maxBuffer: 32 * 1024 * 1024,
    });
    if (stdout !== '') {
      log('%s', stdout);
    }
    if (stderr !== '') {
      log('%s', stderr);
    }
    return stdout.trim();
  } catch (error) {
    const failure = error as Error & { stdout?: string; stderr?: string };
    startGroup(`Failed command: ${program} ${arguments_.join(' ')}`);
    try {
      if (failure.stdout !== undefined && failure.stdout !== '') {
        info(failure.stdout);
      }
      if (failure.stderr !== undefined && failure.stderr !== '') {
        info(failure.stderr);
      }
    } finally {
      endGroup();
    }
    throw error;
  }
}

async function runCommand(
  program: string,
  arguments_: string[],
): Promise<void> {
  info(`Running ${program} ${arguments_.join(' ')}`);
  await command(program, arguments_);
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
  migrateDependencies(manifest);
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
  await runCommand('npx', ['--yes', 'npm-check-updates', '-u']);
  await unlink('package-lock.json');
  await runCommand('npm', ['install', '--ignore-scripts']);
  const validationFailures: string[] = [];
  for (const arguments_ of [
    ['run', 'prepare', '--if-present'],
    ['run', 'prettier:fix'],
    ['run', 'lint:fix'],
    ['run', 'test'],
  ]) {
    try {
      // eslint-disable-next-line no-await-in-loop -- Run validation in order and retain fixes even when a step fails.
      await runCommand('npm', arguments_);
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
