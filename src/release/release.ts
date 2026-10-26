// release/release.ts
/* eslint-disable camelcase -- GitHub API uses snake_case fields. */

import { info, setOutput } from '@actions/core';
import { context } from '@actions/github';
import { Octokit } from '@octokit/rest';
import semver from 'semver';

interface Repo {
  owner: string;
  repo: string;
}

async function ensureTag(
  api: Octokit,
  repo: Repo,
  tag: string,
  sha: string,
): Promise<void> {
  let reference;
  try {
    const { data } = await api.rest.git.getRef({ ...repo, ref: `tags/${tag}` });
    reference = data;
  } catch (error) {
    const NOT_FOUND = 404;
    if ((error as { status?: number }).status !== NOT_FOUND) {
      throw error;
    }
    await api.rest.git.createRef({ ...repo, ref: `refs/tags/${tag}`, sha });
    return;
  }
  // Resolve annotated tags to the commit they ultimately reference.
  let existingSha = reference.object.sha;
  if (reference.object.type !== 'commit') {
    const { data } = await api.rest.repos.getCommit({ ...repo, ref: tag });
    existingSha = data.sha;
  }
  if (existingSha !== sha) {
    throw new Error(`Tag ${tag} already points to another commit.`);
  }
}

async function ensureRelease(
  api: Octokit,
  repo: Repo,
  tag: string,
  sha: string,
): Promise<string> {
  try {
    const { data } = await api.rest.repos.getReleaseByTag({ ...repo, tag });
    if (data.draft || data.prerelease) {
      throw new Error(
        `Release ${tag} already exists as a draft or prerelease.`,
      );
    }
    return data.html_url;
  } catch (error) {
    const NOT_FOUND = 404;
    if ((error as { status?: number }).status !== NOT_FOUND) {
      throw error;
    }
  }
  const { data } = await api.rest.repos.createRelease({
    ...repo,
    tag_name: tag,
    target_commitish: sha,
    name: tag,
    draft: false,
    prerelease: false,
    generate_release_notes: true,
    make_latest: 'legacy',
  });
  return data.html_url;
}

export async function releasePullRequest(
  api: Octokit,
  repo: Repo,
  number: number,
): Promise<void> {
  const { data: pull } = await api.rest.pulls.get({
    ...repo,
    pull_number: number,
  });
  if (!pull.merged) {
    info('Ignoring a pull request that was not merged.');
    return;
  }
  const { data: metadata } = await api.rest.repos.get({ ...repo });
  if (pull.base.ref !== metadata.default_branch) {
    info('Ignoring a pull request merged outside the default branch.');
    return;
  }
  const sha = pull.merge_commit_sha;
  if (sha === null) {
    throw new Error('The merged pull request has no merge commit SHA.');
  }
  const { data: commit } = await api.rest.repos.getCommit({
    ...repo,
    ref: sha,
  });
  if (commit.parents.length !== 1) {
    throw new Error('Release requires a squash merge with a single parent.');
  }
  const { data: manifest } = await api.rest.repos.getContent({
    ...repo,
    path: 'package.json',
    ref: sha,
  });
  if (
    Array.isArray(manifest) ||
    !('content' in manifest) ||
    manifest.encoding !== 'base64'
  ) {
    throw new Error('Unable to read package.json from the merged commit.');
  }
  const { version } = JSON.parse(
    Buffer.from(manifest.content, 'base64').toString('utf8'),
  ) as { version?: unknown };
  if (
    typeof version !== 'string' ||
    semver.valid(version) !== version ||
    semver.prerelease(version) !== null
  ) {
    throw new Error('package.json must contain a stable semantic version.');
  }
  const tag = `v${version}`;
  await ensureTag(api, repo, tag, sha);
  const url = await ensureRelease(api, repo, tag, sha);
  setOutput('version', version);
  setOutput('tag', tag);
  setOutput('release-url', url);
  info(`Released ${tag}: ${url}`);
}

export default async function main(): Promise<void> {
  if (
    !['pull_request', 'pull_request_target'].includes(context.eventName) ||
    context.payload.action !== 'closed'
  ) {
    throw new Error('This action requires a closed pull request event.');
  }
  const pull = context.payload.pull_request as
    { merged?: boolean; number: number } | undefined;
  if (pull?.merged !== true) {
    info('Ignoring a pull request that was not merged.');
    return;
  }
  // eslint-disable-next-line n/no-process-env -- Match the existing action authentication convention.
  const token = process.env['GITHUB_TOKEN'];
  if (token === undefined || token === '') {
    throw new Error('incorrect action configuration: GITHUB_TOKEN is not set');
  }
  await releasePullRequest(
    new Octokit({ auth: token }),
    context.repo,
    pull.number,
  );
}

/* eslint-enable camelcase */
