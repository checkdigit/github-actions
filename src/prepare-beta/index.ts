// prepare-beta/index.ts

import debug from 'debug';
import { setOutput } from '@actions/core';

import { packageJSONUpdate } from './package';

const log = debug('prepare-beta');
export async function main(): Promise<void> {
  log('Action start');
  const packageResult = await packageJSONUpdate(process.cwd());
  setOutput('betaPackage', packageResult);
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
