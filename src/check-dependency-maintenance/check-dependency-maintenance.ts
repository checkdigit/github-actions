// check-dependency-maintenance/check-dependency-maintenance.ts

import { getInput, setOutput } from '@actions/core';
import debug from 'debug';

import {
  getDependencyClient,
  getDependencyRepo,
} from '../github-api/dependency-client.ts';
import {
  checkDependencyMaintenance,
  positiveDays,
} from '../github-api/dependency-maintenance.ts';

const log = debug('github-actions:check-dependency-maintenance');
const DEFAULT_LOOKBACK = 90;

export default async function check(): Promise<void> {
  log('Action start');
  const result = await checkDependencyMaintenance(
    getDependencyClient(),
    await getDependencyRepo(),
    {
      maxAgeDays: positiveDays(getInput('max-age-days'), 30),
      contributorLookbackDays: positiveDays(
        getInput('contributor-lookback-days'),
        DEFAULT_LOOKBACK,
      ),
      fallbackAssignee: getInput('fallback-assignee'),
      command: getInput('command') || '/update-dependencies',
      issueTitle: getInput('issue-title') || 'Update dependencies',
    },
  );
  if (result !== undefined) {
    setOutput('issue-url', result);
  }
  log('Action end');
}
