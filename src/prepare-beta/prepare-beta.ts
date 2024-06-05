// prepare-beta/prepare-beta.ts

import debug from 'debug';
import { setOutput } from '@actions/core';

import { packageJSONUpdate } from './package';

const log = debug('github-actions:prepare-beta');

export default async function (): Promise<void> {
  log('Action start');

  const packageResult = await packageJSONUpdate(process.cwd());
  setOutput('betaPackage', packageResult);

  log('Action end');
}
