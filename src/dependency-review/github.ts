// dependency-review/github.ts

/* eslint-disable @typescript-eslint/no-unnecessary-condition, camelcase, no-await-in-loop, no-magic-numbers, preserve-caught-error */

import { readFile } from 'node:fs/promises';

import { Octokit } from '@octokit/rest';

import { parsePackageLock } from './lockfile.ts';
import { truncateUtf8 } from './report.ts';
import type { Dependency } from './types.ts';

export interface RepositoryContext {
  owner: string;
  repo: string;
  eventName: string;
  event: EventPayload;
}

interface EventPayload {
  number?: number;
  pull_request?: {
    number?: number;
    base?: { sha?: string };
    head?: { sha?: string };
  };
  merge_group?: { base_sha?: string; head_sha?: string };
}

export interface RevisionPair {
  base: string;
  head: string;
}

interface GitTreeEntry {
  path?: string;
  mode?: string;
  type?: string;
  sha?: string | null;
}

export interface LockfileAtRevision {
  path: string;
  content: string;
}

const MAX_TREE_ENTRIES = 250_000;
const MAX_TREE_DEPTH = 100;

export function resolveRevisions(
  context: RepositoryContext,
  explicitBase?: string,
  explicitHead?: string,
): RevisionPair {
  let eventBase: string | undefined;
  let eventHead: string | undefined;
  if (
    context.eventName === 'pull_request' ||
    context.eventName === 'pull_request_target'
  ) {
    eventBase = context.event.pull_request?.base?.sha;
    eventHead = context.event.pull_request?.head?.sha;
  } else if (context.eventName === 'merge_group') {
    eventBase = context.event.merge_group?.base_sha;
    eventHead = context.event.merge_group?.head_sha;
  }
  const base =
    explicitBase !== undefined && explicitBase.length > 0
      ? explicitBase
      : eventBase;
  const head =
    explicitHead !== undefined && explicitHead.length > 0
      ? explicitHead
      : eventHead;
  if (
    base === undefined ||
    base.length === 0 ||
    head === undefined ||
    head.length === 0
  ) {
    throw new Error(
      'Unable to determine base and head revisions. Use pull_request, pull_request_target, or merge_group, or provide both base-ref and head-ref.',
    );
  }
  return { base, head };
}

export async function loadRepositoryContext(): Promise<RepositoryContext> {
  // eslint-disable-next-line n/no-process-env
  const repository = process.env['GITHUB_REPOSITORY'];
  // eslint-disable-next-line n/no-process-env
  const eventPath = process.env['GITHUB_EVENT_PATH'];
  // eslint-disable-next-line n/no-process-env
  const eventName = process.env['GITHUB_EVENT_NAME'] ?? '';
  if (repository === undefined || eventPath === undefined) {
    throw new Error('GITHUB_REPOSITORY and GITHUB_EVENT_PATH must be set');
  }
  const separator = repository.indexOf('/');
  if (separator <= 0 || separator === repository.length - 1) {
    throw new Error(`Invalid GITHUB_REPOSITORY: ${repository}`);
  }
  let event: EventPayload;
  try {
    event = JSON.parse(await readFile(eventPath, 'utf8')) as EventPayload;
  } catch (error) {
    throw new Error(`Unable to read GitHub event payload: ${String(error)}`);
  }
  return {
    owner: repository.slice(0, separator),
    repo: repository.slice(separator + 1),
    eventName,
    event,
  };
}

async function listTreeEntries(
  octokit: Octokit,
  owner: string,
  repo: string,
  commitReference: string,
): Promise<GitTreeEntry[]> {
  const commit = await octokit.rest.git.getCommit({
    owner,
    repo,

    commit_sha: commitReference,
  });
  const queue: { path: string; sha: string; depth: number }[] = [
    { path: '', sha: commit.data.tree.sha, depth: 0 },
  ];
  const files: GitTreeEntry[] = [];
  let visited = 0;

  while (queue.length > 0) {
    const current = queue.shift();
    if (current === undefined) {
      break;
    }
    if (current.depth > MAX_TREE_DEPTH) {
      throw new Error(
        `Repository tree at ${commitReference} exceeds maximum depth ${MAX_TREE_DEPTH}`,
      );
    }
    // Non-recursive tree reads prevent GitHub's recursive response truncation from
    // silently omitting lockfiles in large repositories.

    const response = await octokit.rest.git.getTree({
      owner,
      repo,

      tree_sha: current.sha,
    });
    if (response.data.truncated) {
      throw new Error(
        `GitHub truncated a non-recursive tree response at ${current.path || '/'} for ${commitReference}; comparison cannot be complete`,
      );
    }
    for (const entry of response.data.tree) {
      visited += 1;
      if (visited > MAX_TREE_ENTRIES) {
        throw new Error(
          `Repository tree at ${commitReference} exceeds ${MAX_TREE_ENTRIES} entries`,
        );
      }
      if (
        entry.path === undefined ||
        entry.sha === null ||
        entry.sha === undefined
      ) {
        throw new Error(
          `GitHub returned an incomplete tree entry at ${current.path}`,
        );
      }
      const path = current.path ? `${current.path}/${entry.path}` : entry.path;
      if (entry.type === 'tree') {
        queue.push({ path, sha: entry.sha, depth: current.depth + 1 });
      } else if (entry.type === 'blob') {
        files.push({ ...entry, path });
      }
    }
  }
  return files;
}

export async function fetchLockfiles(
  octokit: Octokit,
  context: Pick<RepositoryContext, 'owner' | 'repo'>,
  revision: string,
): Promise<LockfileAtRevision[]> {
  const entries = await listTreeEntries(
    octokit,
    context.owner,
    context.repo,
    revision,
  );
  const lockEntries = entries.filter(
    (entry) =>
      entry.path !== undefined &&
      (entry.path === 'package-lock.json' ||
        entry.path.endsWith('/package-lock.json')) &&
      !entry.path.includes('/node_modules/'),
  );
  const lockfiles: LockfileAtRevision[] = [];
  for (const entry of lockEntries) {
    if (
      entry.mode !== '100644' &&
      entry.mode !== '100755' &&
      entry.mode !== undefined
    ) {
      throw new Error(
        `Refusing non-regular package-lock.json at ${entry.path}`,
      );
    }
    if (
      entry.sha === null ||
      entry.sha === undefined ||
      entry.path === undefined
    ) {
      throw new Error(
        'GitHub returned an incomplete package-lock.json tree entry',
      );
    }

    const blob = await octokit.rest.git.getBlob({
      owner: context.owner,
      repo: context.repo,

      file_sha: entry.sha,
    });
    if (
      blob.data.encoding !== 'base64' ||
      typeof blob.data.content !== 'string'
    ) {
      throw new Error(`Unsupported GitHub blob encoding for ${entry.path}`);
    }
    lockfiles.push({
      path: entry.path,
      content: Buffer.from(
        blob.data.content.replaceAll('\n', ''),
        'base64',
      ).toString('utf8'),
    });
  }
  return lockfiles.sort((left, right) => left.path.localeCompare(right.path));
}

export function buildInventory(lockfiles: LockfileAtRevision[]): Dependency[] {
  return lockfiles.flatMap((lockfile) =>
    parsePackageLock(lockfile.content, lockfile.path),
  );
}

export function createOctokit(token: string): Octokit {
  return new Octokit({
    auth: token,
    userAgent: 'checkdigit-dependency-review-action',
  });
}

export function pullRequestNumber(
  context: RepositoryContext,
): number | undefined {
  return context.event.pull_request?.number ?? context.event.number;
}

export async function upsertPullRequestComment(
  octokit: Octokit,
  context: RepositoryContext,
  body: string,
): Promise<void> {
  const issueNumber = pullRequestNumber(context);
  if (issueNumber === undefined) {
    throw new Error(
      'PR comment requested but this event has no pull request number',
    );
  }
  const marker = '<!-- checkdigit-dependency-review -->';
  const comments = await octokit.paginate(octokit.rest.issues.listComments, {
    owner: context.owner,
    repo: context.repo,

    issue_number: issueNumber,
    per_page: 100,
  });
  const previous = comments.find(
    (comment) => comment.body?.includes(marker) === true,
  );
  const markedBody = truncateUtf8(`${marker}\n${body}`, 65_000);
  if (previous === undefined) {
    await octokit.rest.issues.createComment({
      owner: context.owner,
      repo: context.repo,

      issue_number: issueNumber,
      body: markedBody,
    });
  } else {
    await octokit.rest.issues.updateComment({
      owner: context.owner,
      repo: context.repo,

      comment_id: previous.id,
      body: markedBody,
    });
  }
}

/* eslint-enable @typescript-eslint/no-unnecessary-condition, camelcase, no-await-in-loop, no-magic-numbers, preserve-caught-error */
