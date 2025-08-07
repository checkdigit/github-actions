// validate-npm-package/validate-npm-package.ts

import os from 'node:os';
import path from 'node:path';
import { promises as fs } from 'node:fs';
import childProcess from 'node:child_process';
import { promisify } from 'node:util';

import core from '@actions/core';
import debug from 'debug';

import { addNPMRCFile } from '../publish-beta/publish.ts';

interface PackageJson {
  name: string;
  version: string;
  engine?: Record<string, string>;
  devDependencies?: Record<string, string>;
  overrides?: Record<string, string>;
}

const exec = promisify(childProcess.exec);
const log = debug('github-actions:validate-npm-package');

async function retrievePackageJson(workFolder: string, packageNameAndBetaVersion: string): Promise<PackageJson> {
  const execResult = await exec(`npm view ${packageNameAndBetaVersion} --json`, { cwd: workFolder });
  log('retrievePackageJson - execResult', execResult);

  const packageJson = JSON.parse(execResult.stdout) as PackageJson;
  log('retrievePackageJson - name', packageJson.name);
  log('retrievePackageJson - version', packageJson.version);
  return packageJson;
}

// create a minimal project with the package as a dependency
async function generateProject(workFolder: string, packageJson: PackageJson): Promise<void> {
  // create index.ts to import the dependency
  await fs.mkdir(`${workFolder}/src`);
  await fs.writeFile(path.join(workFolder, 'src', 'index.ts'), `import '${packageJson.name}';\n`);

  // create package.json with the dependency
  const projectPackageJson = {
    name: 'test',
    version: '0.0.1',
    description: 'test project for validating a target library or service npm package',
    ...(packageJson.engine === undefined ? {} : { engine: packageJson.engine }),
    type: 'module',
    dependencies: {
      [packageJson.name]: packageJson.version,
    },
    devDependencies: packageJson.devDependencies,
    ...(packageJson.overrides === undefined ? {} : { overrides: packageJson.overrides }),
    scripts: {
      compile: 'tsc --noEmit',
    },
  };
  await fs.writeFile(`${workFolder}/package.json`, JSON.stringify(projectPackageJson, null, 2));

  // create tsconfig.json
  const tsconfigJson = {
    extends: '@checkdigit/typescript-config',
    compilerOptions: {
      skipLibCheck: false,
    },
  };
  await fs.writeFile(`${workFolder}/tsconfig.json`, JSON.stringify(tsconfigJson, null, 2));
}

async function installDependencies(workFolder: string): Promise<void> {
  const fullCommandLine = `npm i --ignore-scripts`;
  log('installNpmDependencies - fullCommandLine', fullCommandLine);

  const execResult = await exec(fullCommandLine, { cwd: workFolder });
  log('installNpmDependencies - execResult', execResult);
}

async function verifyDefaultImport(workFolder: string): Promise<void> {
  const fullCommandLine = `npm run compile`;
  log('verifyImportEntryPoints - fullCommandLine', fullCommandLine);

  const execResult = await exec(fullCommandLine, { cwd: workFolder });
  log('verifyImportEntryPoints - execResult', execResult);
}

export default async function (): Promise<void> {
  log('Action start');

  const packageNameAndBetaVersion = core.getInput('betaPackage');
  log('packageNameAndBetaVersion', packageNameAndBetaVersion);

  // eslint-disable-next-line @checkdigit/no-random-v4-uuid
  const workFolder = path.join(os.tmpdir(), crypto.randomUUID());
  await fs.mkdir(workFolder);
  log('temporary work folder created', workFolder);

  await addNPMRCFile(workFolder);

  const packageJson = await retrievePackageJson(workFolder, packageNameAndBetaVersion);

  await generateProject(workFolder, packageJson);

  await installDependencies(workFolder);

  await verifyDefaultImport(workFolder);

  log('Action end');
}
