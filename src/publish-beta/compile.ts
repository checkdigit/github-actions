// publish-beta/compile.ts

import childProcess from 'node:child_process';
import { promisify } from 'node:util';

import debug from 'debug';

const log = debug('github-actions:publish-beta:compile');

const exec = promisify(childProcess.exec);
export default async function (directory: string): Promise<void> {
  log('compile starting');
  await exec('npx tsc --outDir dist --sourceMap true --declarationMap true', { cwd: directory });
  log('compile completed');
}
