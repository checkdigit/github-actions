// publish-beta/compile.ts

import childProcess from 'node:child_process';
import util from 'node:util';
import debug from 'debug';

const log = debug('publish-beta:compile');

const exec = util.promisify(childProcess.exec);
export default async function (directory: string): Promise<void> {
  log('compile starting');
  await exec('tsc --outDir dist --sourceMap true --declarationMap true', { cwd: directory });
  log('compile completed');
}
