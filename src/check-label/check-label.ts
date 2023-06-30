// check-label/check-label.ts

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

async function getLocalPackageJsonVersion(fileName: string): Promise<string> {
  const packageJSONPath = path.join(process.cwd(), fileName);
  const readPackageJson = await readFile(packageJSONPath, 'utf8');
  const packageJson = JSON.parse(readPackageJson) as PackageJSON;

  return packageJson.version;
}

export function validateVersionCompareMatchesSemver(
  branchPackageJsonVersion: string,
  mainPackageJsonVersion: string
): semver.ReleaseType | null {
  const semVersionDiff = semver.diff(branchPackageJsonVersion, mainPackageJsonVersion);
  const newVersionList = branchPackageJsonVersion.split('.');

  if (semVersionDiff === 'minor' && Number(newVersionList[2]) !== 0) {
    throw new Error('Minor version bump but patch version is not 0');
  }

  if (semVersionDiff === 'major' && (Number(newVersionList[1]) !== 0 || Number(newVersionList[2]) !== 0)) {
    throw new Error('Major version bump but minor and patch version is not 0');
  }

  return semVersionDiff;
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

  if (!mainPackageJsonVersionRaw) {
    throw new Error('Unable to get package.json from main branch');
  }
  const mainPackageJsonVersion = JSON.parse(mainPackageJsonVersionRaw) as PackageJSON;

  const packageVersionDiff = validateVersionCompareMatchesSemver(
    branchPackageJsonVersion,
    mainPackageJsonVersion.version
  );
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

  const branchLockFile = await getLocalPackageJsonVersion('package-lock.json');
  assert.equal(branchLockFile, branchPackageJsonVersion, 'package.json and package-lock.json versions do not match');
}
