// check-published/check-published.ts

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { exec } from 'node:child_process';

import debug from 'debug';

import slackPost, { postErrorToSlack } from './slack';

const execAsync = promisify(exec);
const log = debug('github-actions:check-published');

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

export default async function (): Promise<void> {
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

  if (mainPackageJson.name.toLowerCase().includes('template')) {
    log(
      `Action skipped - package name includes "template" and so it's either a template or a new service/library created from a template.`,
    );
    return;
  }

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

  log('Action end');
}
