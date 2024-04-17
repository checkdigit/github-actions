// validate-npm-package/validate-npm-package.ts

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

async function obtainNpmPackage(packageVersion: string, workFolder: string): Promise<void> {
  await addNPMRCFile(workFolder);

  const fullCommandLine = `npm pack ${packageVersion}`;
  log('obtainNpmPackage - fullCommandLine', fullCommandLine);

  const execResult = await exec(fullCommandLine, { cwd: workFolder });
  log('obtainNpmPackage - execResult', execResult);
}

async function unpackNpmPackage(packageTarballFilename: string, workFolder: string): Promise<string> {
  const fullCommandLine = `tar zxvf ${packageTarballFilename}.tgz`;
  log('unpackNpmPackage - fullCommandLine', fullCommandLine);

  const execResult = await exec(fullCommandLine, { cwd: workFolder });
  log('unpackNpmPackage - execResult', execResult);

  return `${workFolder}/package`;
}

async function installNpmDependencies(packageFolder: string): Promise<void> {
  await addNPMRCFile(packageFolder);

  const fullCommandLine = `npm i --ignore-scripts`;
  log('installNpmDependencies - fullCommandLine', fullCommandLine);

  const execResult = await exec(fullCommandLine, { cwd: packageFolder });
  log('installNpmDependencies - execResult', execResult);
}

async function verifyImportEntryPoints(packageFolder: string): Promise<void> {
  const packageJson = JSON.parse(await fs.readFile(`${packageFolder}/package.json`, 'utf8')) as PackageJson;
  const isEsm = packageJson.type === 'module';
  const bundleFolder = isEsm ? 'dist-mjs' : 'dist';
  const suffix = isEsm ? '.mjs' : '.js';

  const rootIndex = `index${suffix}`;
  const serviceEndpointIndexes =
    packageJson.service?.api.endpoints.map((endpoint) => `${endpoint}/index${suffix}`) ?? [];
  const fullCommandLine = [rootIndex, ...serviceEndpointIndexes].map((index) => `node ${index}`).join(' && ');
  log('verifyImportEntryPoints - fullCommandLine', fullCommandLine);

  const execResult = await exec(fullCommandLine, { cwd: `${packageFolder}/${bundleFolder}` });
  log('verifyImportEntryPoints - execResult', execResult);
}

export default async function (packageNameAndBetaVersion: string): Promise<void> {
  log('Action start');
  log('packageNameAndBetaVersion', packageNameAndBetaVersion);

  const workFolder = path.join(os.tmpdir(), uuid());
  await fs.mkdir(workFolder, { recursive: true, mode: 0o700 });
  log('temporaryFolder created', workFolder);

  await obtainNpmPackage(packageNameAndBetaVersion, workFolder);

  // replace all '@' and '/' with '-' and remove leading '-', e.g. @checkdigit/approval@2.0.0-PR.196-b041 -> checkdigit-approval-2.0.0-PR.196-b041
  let packageTarballFilename = packageNameAndBetaVersion.replaceAll(/[@/]/gu, '-');
  if (packageTarballFilename.startsWith('-')) {
    packageTarballFilename = packageTarballFilename.slice(1);
  }
  const packageFolder = await unpackNpmPackage(packageTarballFilename, workFolder);

  await installNpmDependencies(packageFolder);

  await verifyImportEntryPoints(packageFolder);

  log('Action end');
}
