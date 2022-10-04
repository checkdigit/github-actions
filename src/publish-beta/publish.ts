// publish-beta/publish.ts

import childProcess from 'node:child_process';
import util from 'node:util';
import debug from 'debug';

const log = debug('action:publish');

const exec = util.promisify(childProcess.exec);
export default async function (directory: string): Promise<void> {
  log('publish starting');
  await exec('npm publish --tag beta', { cwd: directory });
  log('publish completed');
}
