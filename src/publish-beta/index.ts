// publish-beta/index.ts

import process from 'node:process';
import path from 'node:path';
import { debug } from 'debug';

import { publishCommentAndRemovePrevious } from '../github-api';
import { packageJSONUpdate } from './package';
import copyNonTSFiles from './files';
import compile from './compile';
import publish from './publish';

const log = debug('publish-beta');
export async function main(): Promise<void | boolean> {
  log('Action start');

  await compile(process.cwd());
  const packageNameAndBetaVersion = await packageJSONUpdate(process.cwd());
  await copyNonTSFiles(path.join(process.cwd(), 'src'), path.join(process.cwd(), 'dist'));
  await publish(process.cwd());
  await publishCommentAndRemovePrevious(
    `Beta Published - Install Command: \`npm install ${packageNameAndBetaVersion}\` `.replaceAll('"', ''),
    'Beta Published - Install Command: '
  );
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
