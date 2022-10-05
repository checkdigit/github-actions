// publish-beta/command.ts

import process from 'node:process';
import path from 'node:path';
import { debug } from 'debug';

import { publishComment } from './github';
import { packageJSONUpdate } from './package';
import copyNonTSFiles from './copy-files';
import compile from './compile';
import publish from './publish';

const log = debug('action:command');
export default async function (): Promise<void | boolean> {
  log('Action starts:command');

  await compile(process.cwd());
  const packageNameAndBetaVersion = await packageJSONUpdate(process.cwd());
  await copyNonTSFiles(path.join(process.cwd(), 'src'), path.join(process.cwd(), 'dist'));
  await publish(process.cwd());
  await publishComment(packageNameAndBetaVersion);
}
