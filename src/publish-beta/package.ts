// publish-beta/package.ts

import path from 'node:path';
import { readFile, writeFile } from 'node:fs/promises';
import { debug } from 'debug';

import { getPRNumber } from '../github-api';
import { removeTestFilesFromSource } from './files';

const log = debug('publish-beta:package');

interface PackageJSON {
  name: string;
  version: string;
  files: string[];
}

const NUMBER_OF_CHARS_TO_USE_FROM_COMMIT_SHA = 4;

export function generatePackageBetaTag(): string {
  const commentSha = process.env['GITHUB_SHA'];
  if (!commentSha) {
    throw new Error('Unable to get GITHUB_SHA');
  }
  const id = commentSha.slice(-NUMBER_OF_CHARS_TO_USE_FROM_COMMIT_SHA, commentSha.length);
  const prNumber = getPRNumber();
  return `PR.${prNumber}-${id}`;
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

  await removeTestFilesFromSource(path.join(rootProjectDirectory, 'src'));

  const files = addSourceToFilesProperty(packageJson);
  const newVersion = `${packageJson.version}-${generatePackageBetaTag()}`;
  packageJson.version = newVersion;
  packageJson.files = files;
  await writeFile(packageJSONPath, JSON.stringify(packageJson));
  log(`Updated package.json - new version is: ${packageJson.name}@${newVersion}`);
  return `${packageJson.name}@${newVersion}`;
}
