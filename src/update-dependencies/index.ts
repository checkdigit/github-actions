// update-dependencies/index.ts

import { getInput, setFailed } from '@actions/core';
import { context } from '@actions/github';

import { authorizeComment } from '../github-api/dependency-issue-command.ts';
import {
  getDependencyClient,
  getDependencyRepo,
} from '../github-api/dependency-client.ts';
import { publishDependencyComment } from '../github-api/dependency-updates.ts';
import main from './update-dependencies.ts';

try {
  await main();
} catch (error) {
  setFailed(error instanceof Error ? error.message : String(error));
  try {
    const api = getDependencyClient();
    const repo = await getDependencyRepo();
    const issue = await authorizeComment(
      api,
      repo,
      context.payload as unknown as Parameters<typeof authorizeComment>[2],
      getInput('command') || '/update-dependencies',
    );
    if (issue !== undefined) {
      await publishDependencyComment(
        api,
        repo,
        issue,
        `Dependency update failed. See logs: ${context.serverUrl}/${repo.owner}/${repo.repo}/actions/runs/${context.runId}. The issue remains open; fix the failure and post the command again.`,
      );
    }
  } catch {
    /*
    The original failure remains the workflow result.
    */
  }
}
