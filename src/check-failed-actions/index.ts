// check-failed-actions/index.ts

import process from 'node:process';
import { debug } from 'debug';
import { getInput } from '@actions/core';

import { getPullRequestContext } from '../github-api';
import slackPost from './slack';

const log = debug('check-failed-action');

export async function main(): Promise<void | boolean> {
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

main()
  .then(() => {
    process.stdin.destroy();
    // eslint-disable-next-line unicorn/no-process-exit
    process.exit(0);
  })
  // eslint-disable-next-line unicorn/prefer-top-level-await
  .catch((error) => {
    // eslint-disable-next-line no-console
    console.log('Action Error - exit 1 - error:', error);
    // eslint-disable-next-line unicorn/no-process-exit
    process.exit(1);
  });
