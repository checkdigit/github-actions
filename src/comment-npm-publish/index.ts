// comment-npm-publish/index.ts

import debug from 'debug';
import { getInput } from '@actions/core';

import { publishCommentAndRemovePrevious } from '../github-api';

const log = debug('github-actions:comment-npm-publish');
export async function main(): Promise<void> {
  log('Action start');

  const packageNameAndBetaVersion = getInput('betaPackage');
  log('Package Name and Version obtained: ', packageNameAndBetaVersion);
  await publishCommentAndRemovePrevious(
    `Beta Published - Install Command: \`npm install ${packageNameAndBetaVersion}\` `.replaceAll('"', ''),
    'Beta Published - Install Command: ',
  );
  log('Action end');
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
