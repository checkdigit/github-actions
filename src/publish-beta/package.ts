// publish-beta/package.ts

import path from 'node:path';
import { readFile, writeFile } from 'node:fs/promises';
import { debug } from 'debug';

import shortId from './short-id';
import { getPRNumber } from './github';
import { removeNonTSFiles } from './files';

const log = debug('publish-beta:package');

interface PackageJSON {
  name: string;
  version: string;
  files: string[];
}

export function generatePackageBetaTag(): string {
  const id = shortId();
  const prNumber = getPRNumber();
  return `${prNumber}-${id}`;
}

function checkFilesPropertyExists(packageJSON: string): void {
  const packageJSONObject = JSON.parse(packageJSON) as { files?: string[] };
  if (!packageJSONObject.files) {
    throw new Error('package.json does not have a files: [] property');
  }
}

function addSourceToFilesProperty(input: PackageJSON): string[] {
  if (!input.files.includes('/src/')) {
    return [...input.files, '/src/'];
  }
  return input.files;
}

export async function packageJSONUpdate(rootProjectDirectory: string): Promise<string> {
  const packageJSONPath = path.join(rootProjectDirectory, 'package.json');
  const readPackageJson = await readFile(packageJSONPath, 'utf8');
  checkFilesPropertyExists(readPackageJson);
  const packageJson = JSON.parse(readPackageJson) as PackageJSON;

  await removeNonTSFiles(path.join(rootProjectDirectory, 'src'));

  const files = addSourceToFilesProperty(packageJson);
  const newVersion = `${packageJson.version}-beta.${generatePackageBetaTag()}`;
  packageJson.version = newVersion;
  packageJson.files = files;
  await writeFile(packageJSONPath, JSON.stringify(packageJson));
  log(`Updated package.json - new version is: ${packageJson.name}@${newVersion}`);
  return `${packageJson.name}@${newVersion}`;
}
