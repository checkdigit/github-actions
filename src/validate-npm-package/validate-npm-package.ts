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
  name: string;
  version: string;
  devDependencies?: Record<string, string>;
}

const exec = util.promisify(childProcess.exec);
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
    engines: {
      node: '>=20.11',
    },
    type: 'module',
    dependencies: {
      [packageJson.name]: packageJson.version,
    },
    devDependencies: {
      // including the devDependencies from the target package is necessary for resolving the typing references including but not limited to the types from its service dependencies
      ...packageJson.devDependencies,
      '@checkdigit/typescript-config': '^7.0.1',
    },
    scripts: {
      compile: 'tsc --noEmit',
    },
  };
  await fs.writeFile(`${workFolder}/package.json`, JSON.stringify(projectPackageJson, null, 2));

  // create tsconfig.json
  const tsconfigJson = {
    extends: '@checkdigit/typescript-config',
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

export default async function (packageNameAndBetaVersion: string): Promise<void> {
  log('Action start');
  log('packageNameAndBetaVersion', packageNameAndBetaVersion);

  const workFolder = path.join(os.tmpdir(), uuid());
  await fs.mkdir(workFolder);
  log('temporary work folder created', workFolder);

  await addNPMRCFile(workFolder);

  const packageJson = await retrievePackageJson(workFolder, packageNameAndBetaVersion);

  await generateProject(workFolder, packageJson);

  await installDependencies(workFolder);

  await verifyDefaultImport(workFolder);

  log('Action end');
}
