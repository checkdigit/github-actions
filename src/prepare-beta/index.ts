// prepare-beta/index.ts

import debug from 'debug';
import { setOutput } from '@actions/core';

import { packageJSONUpdate } from './package';

const log = debug('github-actions:prepare-beta');
export async function main(): Promise<void> {
  log('Action start');
  const packageResult = await packageJSONUpdate(process.cwd());
  setOutput('betaPackage', packageResult);
}

await main();
