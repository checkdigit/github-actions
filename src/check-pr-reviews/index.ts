// check-pr-reviews/index.ts

import process from 'node:process';
import { debug } from 'debug';
import { setFailed } from '@actions/core';

import { reviewedCorrectly } from '../github-api';

const log = debug('check-pr-reviews');
export async function main(): Promise<void | boolean> {
  log('Action start');

  const result = await reviewedCorrectly();
  if (!result) {
    setFailed('PR has not been reviewed correctly');
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
