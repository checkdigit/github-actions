// check-label/check-label.ts

import path from 'node:path';
import { strict as assert } from 'node:assert';
import { readFile } from 'node:fs/promises';

import debug from 'debug';
import semver from 'semver';

import { getFileFromMain, getLabelsOnPR } from '../github-api';

const log = debug('github-actions:check-label');

interface PackageJSON {
  name: string;
  version: string;
  files: string[];
}

async function getLocalPackageJsonVersion(fileName: string): Promise<string> {
  const packageJSONPath = path.join(process.cwd(), fileName);
  const readPackageJson = await readFile(packageJSONPath, 'utf8');
  const packageJson = JSON.parse(readPackageJson) as PackageJSON;

  return packageJson.version;
}

export function validateVersion(
  branchPackageJsonVersion: string,
  mainPackageJsonVersion: string,
  prLabel: string,
): true {
  if (semver.gt(mainPackageJsonVersion, branchPackageJsonVersion)) {
    log(`Main branch version: ${mainPackageJsonVersion} vs branch version: ${branchPackageJsonVersion}`);
    throw new Error('main version is ahead of branch version');
  }

  const mainVersionSplit = mainPackageJsonVersion.split('.');

  if (prLabel === 'patch') {
    mainVersionSplit[2] = (Number(mainVersionSplit[2]) + 1).toString();
  } else if (prLabel === 'minor') {
    mainVersionSplit[1] = (Number(mainVersionSplit[1]) + 1).toString();
    mainVersionSplit[2] = '0';
  } else if (prLabel === 'major') {
    mainVersionSplit[0] = (Number(mainVersionSplit[0]) + 1).toString();
    mainVersionSplit[1] = '0';
    mainVersionSplit[2] = '0';
  } else {
    throw new Error('Invalid label');
  }

  const expectedVersion = mainVersionSplit.join('.');
  assert.equal(branchPackageJsonVersion, expectedVersion, 'Version is incorrect based on Pull Request label');
  return true;
}

export default async function (): Promise<void> {
  log('Action start');

  const labelsPullRequest = await getLabelsOnPR();
  if (labelsPullRequest.length > 1) {
    throw new Error('PR has more than one label');
  }
  const label = labelsPullRequest[0]?.toLowerCase();
  assert(label, 'Unable to get label from PR');

  const branchPackageJsonVersion = await getLocalPackageJsonVersion('package.json');
  const mainPackageJsonVersionRaw = await getFileFromMain('package.json');

  if (mainPackageJsonVersionRaw === undefined) {
    throw new Error('Unable to get package.json from main branch');
  }
  const mainPackageJsonVersion = JSON.parse(mainPackageJsonVersionRaw) as PackageJSON;

  validateVersion(branchPackageJsonVersion, mainPackageJsonVersion.version, label);

  const branchLockFile = await getLocalPackageJsonVersion('package-lock.json');
  assert.equal(branchPackageJsonVersion, branchLockFile, 'package.json and package-lock.json versions do not match');
}
