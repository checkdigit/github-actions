// publish-beta/publish.ts

import childProcess from 'node:child_process';
import util from 'node:util';
import fs from 'node:fs/promises';
import debug from 'debug';

const log = debug('github-actions:publish-beta:publish');

const exec = util.promisify(childProcess.exec);

export async function addNPMRCFile(rootProjectDirectory: string): Promise<void> {
  const npmrcPath = `${rootProjectDirectory}/.npmrc`;
  try {
    await fs.access(npmrcPath);
    log('.npmrc file already exists', npmrcPath);
  } catch {
    // eslint-disable-next-line no-template-curly-in-string
    await fs.writeFile(npmrcPath, '//registry.npmjs.org/:_authToken=${NPM_TOKEN}', 'utf8');
    log('.npmrc file created', npmrcPath);
  }
}

export default async function (directory: string): Promise<void> {
  log('publish starting');
  await addNPMRCFile(directory);
  await exec('npm publish --tag beta', { cwd: directory });
  log('publish completed');
}
