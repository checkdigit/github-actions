// check-published/index.ts

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { exec } from 'node:child_process';

import debug from 'debug';

import slackPost, { postErrorToSlack } from './slack';

const execAsync = promisify(exec);

const log = debug('check-published');
interface PackageJSON {
  name: string;
  version: string;
}
async function getLocalPackageJson(fileName: string): Promise<PackageJSON> {
  const packageJSONPath = path.join(process.cwd(), fileName);
  const readPackageJson = await readFile(packageJSONPath, 'utf8');
  return JSON.parse(readPackageJson) as PackageJSON;
}

async function getVersionFromNPM(packageName: string): Promise<string> {
  const { stdout: latestVersion } = await execAsync(`npm show ${packageName} version`);
  return latestVersion.replaceAll(/[\n\r]/gu, '').trim(); // rm any new lines
}

export async function main(): Promise<void> {
  log('Action starting');
  let mainPackageJson: PackageJSON;
  try {
    mainPackageJson = await getLocalPackageJson('package.json');
  } catch {
    const errorMessage = 'Action failed - could not read package.json';
    await postErrorToSlack(errorMessage);
    log(errorMessage);
    throw new Error(errorMessage);
  }

  log(`Main package.json - name ${mainPackageJson.name} - version ${mainPackageJson.version}`);

  // run npm show to get the latest version published
  let latestVersion: string;
  try {
    latestVersion = await getVersionFromNPM(mainPackageJson.name);
  } catch {
    const errorMessage = `Action failed - could not get latest version from npm - name: ${mainPackageJson.name}`;
    await postErrorToSlack(errorMessage);
    throw new Error(errorMessage);
  }

  log(`Latest version published - ${latestVersion}`);

  if (mainPackageJson.version !== latestVersion) {
    log('Action failed - version published does not match');
    await slackPost(mainPackageJson.name, mainPackageJson.version, latestVersion);
    throw new Error(`Version published does not match - ${mainPackageJson.version} !== ${latestVersion}`);
  }
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
