// publish-beta/publish-beta.ts

import path from 'node:path';

import debug from 'debug';

import { publishCommentAndRemovePrevious } from '../github-api';
import { packageJSONUpdate } from './package';
import copyNonTSFiles from './files';
import compile from './compile';
import publish from './publish';

const log = debug('github-actions:publish-beta');

export default async function (): Promise<void> {
  log('Action start');

  await compile(process.cwd());
  const packageNameAndBetaVersion = await packageJSONUpdate(process.cwd());
  await copyNonTSFiles(path.join(process.cwd(), 'src'), path.join(process.cwd(), 'dist'));
  await publish(process.cwd());
  await publishCommentAndRemovePrevious(
    `Beta Published - Install Command: \`npm install ${packageNameAndBetaVersion}\` `.replaceAll('"', ''),
    'Beta Published - Install Command: ',
  );

  log('Action end');
}
