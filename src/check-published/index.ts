// check-published/index.ts

import process from 'node:process';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { exec } from 'node:child_process';
import { debug } from 'debug';

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
  return latestVersion.replace(/[\n\r]/gu, '').trim(); // rm any new lines
}

export async function main(): Promise<void | boolean> {
  log('Action starting');
  const mainPackageJson = await getLocalPackageJson('package.json');
  log(`Main package.json - name ${mainPackageJson.name} - version ${mainPackageJson.version}`);

  // run npm show to get the latest version published
  const latestVersion = await getVersionFromNPM(mainPackageJson.name);
  log(`Latest version published - ${latestVersion}`);

  if (mainPackageJson.version !== latestVersion) {
    log('Action failed - version published does not match');
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
