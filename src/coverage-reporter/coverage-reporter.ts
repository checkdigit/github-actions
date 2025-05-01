// coverage-reporter/coverage-reporter.ts

/**
 * Based on code from lcov-report-action, see LICENSE.lcov-reporter-action.txt.
 * https://github.com/romeovs/lcov-reporter-action
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';

import { getInput, setFailed } from '@actions/core';
import { context, getOctokit } from '@actions/github';
import debug from 'debug';

import { parse } from './lcov';
import { diff } from './comment';
import { getChangedFiles } from './get-changes';
import { deleteOldComments } from './delete-old-comments';
import type { Options } from './options';
import { normalizePath } from './util';

const MAX_COMMENT_CHARS = 65_536;
const log = debug('github-actions:coverage-reporter');

const LCOV_FILE_NAME = 'lcov.info';

export default async function (): Promise<void> {
  try {
    log('Action start');

    const token = getInput('github-token');
    const githubClient = getOctokit(token);
    const workingDirectory = getInput('working-directory') || './';
    const prLcovFile = path.join(workingDirectory, getInput('coverage-results-folder-pr'), LCOV_FILE_NAME);
    const baseLcovFile = path.join(workingDirectory, getInput('coverage-results-folder-base'), LCOV_FILE_NAME);
    const shouldFilterChangedFiles = getInput('filter-changed-files').toLowerCase() === 'true';
    const shouldDeleteOldComments = getInput('delete-old-comments').toLowerCase() === 'true';
    const title = getInput('title');

    const raw = await fs.readFile(prLcovFile, 'utf8').catch(() => null);
    if (raw === null || raw === '') {
      // eslint-disable-next-line no-console
      console.log(`No coverage report found at '${prLcovFile}', exiting...`);
      return;
    }

    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const baseRaw = baseLcovFile && (await fs.readFile(baseLcovFile, 'utf8').catch(() => null))!;
    if (baseLcovFile && !baseRaw) {
      // eslint-disable-next-line no-console
      console.log(`No coverage report found at '${baseLcovFile}', ignoring...`);
    }

    const options = {
      repository: context.payload.repository?.full_name,
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      prefix: normalizePath(`${process.env['GITHUB_WORKSPACE']!}/`),
      workingDir: workingDirectory,
    } as Options;

    if (context.eventName === 'pull_request') {
      options.commit = (context.payload.pull_request?.['head'] as { sha: string }).sha;
      options.baseCommit = (context.payload.pull_request?.['base'] as { sha: string }).sha;
      options.head = (context.payload.pull_request?.['head'] as { ref: string }).ref;
      options.base = (context.payload.pull_request?.['base'] as { ref: string }).ref;
    } else if (context.eventName === 'push') {
      options.commit = context.payload['after'] as string;
      options.baseCommit = context.payload['before'] as string;
      options.head = context.ref;
    }

    options.shouldFilterChangedFiles = shouldFilterChangedFiles;
    options.title = title;

    if (shouldFilterChangedFiles) {
      options.changedFiles = await getChangedFiles(githubClient, options, context);
    }

    const lcov = parse(raw);
    const baseLcov = parse(baseRaw);
    const body = diff(lcov, baseLcov, options).slice(0, Math.max(0, MAX_COMMENT_CHARS));

    if (shouldDeleteOldComments) {
      await deleteOldComments(githubClient, options, context);
    }

    if (context.eventName === 'pull_request') {
      await githubClient.rest.issues.createComment({
        repo: context.repo.repo,
        owner: context.repo.owner,
        // eslint-disable-next-line camelcase, @typescript-eslint/no-non-null-assertion, @typescript-eslint/no-non-null-asserted-optional-chain
        issue_number: context.payload.pull_request?.number!,
        body,
      });
    } else if (context.eventName === 'push') {
      await githubClient.rest.repos.createCommitComment({
        repo: context.repo.repo,
        owner: context.repo.owner,
        // eslint-disable-next-line camelcase
        commit_sha: options.commit,
        body,
      });
    }

    log('Action end');
  } catch (error) {
    // eslint-disable-next-line no-console
    console.log(error);
    setFailed((error as { message: string }).message);
  }
}
