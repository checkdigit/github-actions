// comment-npm-publish/comment-npm-publish.ts

import debug from 'debug';
import { getInput } from '@actions/core';

import { publishCommentAndRemovePrevious } from '../github-api/index.ts';

const log = debug('github-actions:comment-npm-publish');

export default async function (): Promise<void> {
  log('Action start');

  const packageNameAndBetaVersion = getInput('betaPackage');
  log('Package Name and Version obtained: ', packageNameAndBetaVersion);

  await publishCommentAndRemovePrevious(
    `Beta Published - Install Command: \`npm install ${packageNameAndBetaVersion}\` `.replaceAll('"', ''),
    'Beta Published - Install Command: ',
  );

  log('Action end');
}
