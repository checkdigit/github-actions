// check-failed-actions/check-failed.ts

import process from 'node:process';
import { debug } from 'debug';
import { getInput } from '@actions/core';

import { getPullRequestContext } from '../github-api';
import slackPost from './slack';

const log = debug('check-failed-action');
export default async function (): Promise<void | boolean> {
  log('Action starting');

  const githubContext = await getPullRequestContext();
  if (!githubContext) {
    log('Error - unable to get github context');
    return;
  }

  const workFlowName = process.env['GITHUB_WORKFLOW'] ?? 'unknown';
  log('GITHUB_WORKFLOW', workFlowName);

  const branch = process.env['GITHUB_REF'] ?? 'unknown';

  const failedJob = getInput('failed');
  log('Status received', failedJob);
  if (failedJob === 'true') {
    await slackPost(`${githubContext.owner}/${githubContext.repo}`, branch, workFlowName);
  }
}
