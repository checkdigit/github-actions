// check-failed-actions/index.ts

import process from 'node:process';
import { debug } from 'debug';
import { getInput } from '@actions/core';

import { getPullRequestContext } from '../github-api';
import slackPost from './slack';

const log = debug('check-failed-actions');

export async function main(): Promise<void | boolean> {
  log('Action starting');

  const githubContext = await getPullRequestContext();
  if (!githubContext) {
    log('Error - unable to get github context');
    return;
  }

  const statusInput = getInput('failed');
  log('Status received', statusInput);
  if (statusInput === 'true') {
    await slackPost(`${githubContext.owner}/${githubContext.repo}`);
  }

  // const shouldDeleteOldComments = getInput('delete-old-comments').toLowerCase() === 'true';

  // const octokat = new Octokit({ auth: process.env['GITHUB_TOKEN'] });

  // const workFlows = await octokat.actions.listRepoWorkflows({ owner: githubContext.owner, repo: githubContext.repo });
  // workFlows.data.workflows.forEach((flow) => {
  //   flow.
  // });
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
