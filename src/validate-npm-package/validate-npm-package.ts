// validate-npm-package/validate-npm-package.ts

// NOTE: Requires that ~/.npmrc has proper auth token set for the registry.

import os from 'node:os';
import path from 'node:path';
import { promises as fs } from 'node:fs';
import childProcess from 'node:child_process';
import util from 'node:util';

import debug from 'debug';
import { v4 as uuid } from 'uuid';
import { addNPMRCFile } from '../publish-beta/publish';

interface PackageJson {
  type?: string;
  service?: {
    api: {
      root: string;
      endpoints: string[];
    };
  };
}

const exec = util.promisify(childProcess.exec);
const log = debug('github-actions:validate-npm-package');

async function obtainNpmPackage(packageVersion: string, baseFolder: string): Promise<void> {
  const commands = [`cd ${baseFolder}`, `npm pack ${packageVersion}`];
  const fullCommandLine = commands.join(' && ');
  log('obtainNpmPackage - fullCommandLine', fullCommandLine);

  const execResult = await exec(fullCommandLine);
  log('obtainNpmPackage - execResult', JSON.stringify(execResult, undefined, 2));
}

async function unpackNpmPackage(packageTarballFilename: string, baseFolder: string): Promise<void> {
  const commands = [`cd ${baseFolder}`, `tar zxvf ${packageTarballFilename}.tgz`];
  const fullCommandLine = commands.join(' && ');
  log('unpackNpmPackage - fullCommandLine', fullCommandLine);

  const execResult = await exec(fullCommandLine);
  log('unpackNpmPackage - execResult', JSON.stringify(execResult, undefined, 2));
}

async function installNpmDependencies(baseFolder: string): Promise<void> {
  const commands = [`cd ${baseFolder}/package`, `npm i --ignore-scripts`];
  const fullCommandLine = commands.join(' && ');
  log('installNpmDependencies - fullCommandLine', fullCommandLine);

  const execResult = await exec(fullCommandLine);
  log('installNpmDependencies - execResult', JSON.stringify(execResult, undefined, 2));
}

async function verifyNpmPackage(baseFolder: string): Promise<void> {
  const packageJson = JSON.parse(await fs.readFile(`${baseFolder}/package/package.json`, 'utf8')) as PackageJson;

  const isEsm = packageJson.type === 'module';
  const bundleFolder = isEsm ? 'dist-mjs' : 'dist';
  const suffix = isEsm ? '.mjs' : '.js';

  const rootIndex = `index${suffix}`;

  const serviceEndpointIndexes =
    packageJson.service?.api.endpoints.map((endpoint) => `${endpoint}/index${suffix}`) ?? [];

  const commands = [
    `cd ${baseFolder}/package/${bundleFolder}`,
    ...[rootIndex, ...serviceEndpointIndexes].map((index) => `node ${index}`),
  ];

  const fullCommandLine = commands.join(' && ');
  log('verifyNpmPackage - fullCommandLine', fullCommandLine);

  const execResult = await exec(fullCommandLine);
  log('verifyNpmPackage - execResult', JSON.stringify(execResult, undefined, 2));
}

// function extractPackageNameAndVersion(packageNameAndBetaVersion: string): {
//   packageName: string;
//   version: string;
// } {
//   const separatorIndex = packageNameAndBetaVersion.lastIndexOf('@');
//   const packageName = packageNameAndBetaVersion.slice(0, separatorIndex);
//   const version = packageNameAndBetaVersion.slice(separatorIndex + 1);
//   log('Package Name:', packageName);
//   log('Version:', version);
//   return {
//     packageName,
//     version,
//   };
// }

export default async function (packageNameAndBetaVersion: string): Promise<void> {
  log('Action start');
  log('packageNameAndBetaVersion', packageNameAndBetaVersion);

  const workFolder = path.join(os.tmpdir(), uuid());
  await fs.mkdir(workFolder, { recursive: true, mode: 0o700 });
  log('temporaryFolder created', workFolder);

  await obtainNpmPackage(packageNameAndBetaVersion, workFolder);

  // replace all '@' and '/' with '-' and remove leading '-'
  // e.g. @checkdigit/approval@2.0.0-PR.196-b041 -> checkdigit-approval-2.0.0-PR.196-b041
  let packageTarballFilename = packageNameAndBetaVersion.replaceAll(/[@/]/gu, '-');
  if (packageTarballFilename.startsWith('-')) {
    packageTarballFilename = packageTarballFilename.slice(1);
  }
  await unpackNpmPackage(packageTarballFilename, workFolder);

  await addNPMRCFile(workFolder);

  await installNpmDependencies(workFolder);

  await verifyNpmPackage(workFolder);

  log('Action end');
}
