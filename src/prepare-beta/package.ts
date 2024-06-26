// prepare-beta/package.ts

import path from 'node:path';
import { readFile, writeFile } from 'node:fs/promises';

import debug from 'debug';

import { getPRNumber } from '../github-api';

const log = debug('github-actions:publish-beta:package');

interface PackageJSON {
  name: string;
  version: string;
  files: string[];
}

const NUMBER_OF_CHARS_TO_USE_FROM_COMMIT_SHA = 4;

export function generatePackageBetaTag(): string {
  const commentSha = process.env['GITHUB_SHA'];
  if (commentSha === undefined || commentSha === '') {
    throw new Error('Unable to get GITHUB_SHA');
  }
  const id = commentSha.slice(-NUMBER_OF_CHARS_TO_USE_FROM_COMMIT_SHA, commentSha.length);
  const prNumber = getPRNumber();
  return `PR.${prNumber}-${id}`;
}

export async function packageJSONUpdate(rootProjectDirectory: string): Promise<string> {
  const packageJSONPath = path.join(rootProjectDirectory, 'package.json');
  const readPackageJson = await readFile(packageJSONPath, 'utf8');
  const packageJson = JSON.parse(readPackageJson) as PackageJSON;

  const newVersion = `${packageJson.version}-${generatePackageBetaTag()}`;
  packageJson.version = newVersion;
  await writeFile(packageJSONPath, JSON.stringify(packageJson));
  log(`Updated package.json - new version is: ${packageJson.name}@${newVersion}`);
  return `${packageJson.name}@${newVersion}`;
}
