// publish-beta/package.ts

import path from 'node:path';
import { readFile, stat, writeFile } from 'node:fs/promises';
import { debug } from 'debug';

import shortId from './short-id';
import { getPRNumber } from './github';

const log = debug('action:package');

export async function isPackageAnAPI(rootProjectDirectory: string): Promise<boolean> {
  try {
    await stat(path.join(rootProjectDirectory, 'src/api'));
    log('isAPI:true');
    // eslint-disable-next-line no-console
    console.log('::set-output name=IS_API::true');
    return true;
  } catch {
    log('isAPI:false');
    // eslint-disable-next-line no-console
    console.log('::set-output name=IS_API::false');
  }
  return false;
}

export function generatePackageBetaTag(): string {
  const id = shortId();
  const prNumber = getPRNumber();
  return `${prNumber}-${id}`;
}

export async function packageJSONUpdate(rootProjectDirectory: string): Promise<void> {
  const packageJSONPath = path.join(rootProjectDirectory, 'package.json');
  const readPackageJson = await readFile(packageJSONPath, 'utf8');
  const packageJson = JSON.parse(readPackageJson) as { version: string; name: string };
  const newVersion = `${packageJson.version}-beta.${generatePackageBetaTag()}`;
  packageJson.version = newVersion;
  await writeFile(packageJSONPath, JSON.stringify(packageJson));
  log(`Updated package.json - new version is: ${packageJson.name}@${newVersion}`);
  // eslint-disable-next-line no-console
  console.log(`::set-output name=NEW_VERSION::${packageJson.name}@${newVersion}`);
}
