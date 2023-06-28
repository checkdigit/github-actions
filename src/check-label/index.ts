// check-label/index.ts

import process from 'node:process';
import path from 'node:path';
import assert from 'node:assert';
import { readFile } from 'node:fs/promises';
import { debug } from 'debug';
import { setFailed } from '@actions/core';
import semver from 'semver';

import { getFileFromMain, getLabelsOnPR } from '../github-api';

const log = debug('check-label');

interface PackageJSON {
  name: string;
  version: string;
  files: string[];
}

async function getLocalPackageJsonVersion(): Promise<string> {
  const packageJSONPath = path.join(process.cwd(), 'package.json');
  const readPackageJson = await readFile(packageJSONPath, 'utf8');
  const packageJson = JSON.parse(readPackageJson) as PackageJSON;

  return packageJson.version;
}

export async function main(): Promise<void | boolean> {
  log('Action start');

  const labelsPullRequest = await getLabelsOnPR();
  if (labelsPullRequest.length > 1) {
    throw new Error('PR has more than one label');
  }
  const label = labelsPullRequest[0]?.toLowerCase();
  assert(label, 'Unable to get label from PR');

  const branchPackageJsonVersion = await getLocalPackageJsonVersion();
  const mainPackageJsonVersionRaw = await getFileFromMain();

  if (!mainPackageJsonVersionRaw) {
    throw new Error('Unable to get package.json from main branch');
  }
  const mainPackageJsonVersion = JSON.parse(mainPackageJsonVersionRaw) as PackageJSON;

  const packageVersionDiff = semver.diff(branchPackageJsonVersion, mainPackageJsonVersion.version);
  if (packageVersionDiff !== label) {
    log(
      `Main branch version: ${
        mainPackageJsonVersion.version
      } vs branch version: ${branchPackageJsonVersion} - diff: ${String(packageVersionDiff)} - git label ${label}`
    );
    setFailed(`PR has not had the package.json updated correctly`);
    throw new Error('PR has not had the package.json updated correctly');
  }

  if (semver.gt(mainPackageJsonVersion.version, branchPackageJsonVersion)) {
    log('Main branch version is greater than branch version');
    log(`Main branch version: ${mainPackageJsonVersion.version} vs branch version: ${branchPackageJsonVersion}`);
    setFailed(`PR has not had the package.json updated correctly`);
    throw new Error('PR has not had the package.json updated correctly');
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
