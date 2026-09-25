// validate-npm-package/validate-npm-package.ts

import os from 'node:os';
import path from 'node:path';
import { promises as fs } from 'node:fs';
import childProcess from 'node:child_process';
import { promisify } from 'node:util';

import { getInput } from '@actions/core';
import retry from '@checkdigit/retry';
import timeout from '@checkdigit/timeout';
import debug from 'debug';

import { addNPMRCFile } from '../publish-beta/publish.ts';

interface PackageJson {
  name: string;
  version: string;
  engine?: Record<string, string>;
  main?: string; // for backward compatibility
  exports?: {
    '.'?: {
      import?: string;
    };
  };
}

const exec = promisify(childProcess.exec);
const log = debug('github-actions:validate-npm-package');

const NPM_RETRY_WINDOW_MILLISECONDS = 10 * 60 * 1000;

async function execNpmWithRetry(
  commandLine: string,
  workFolder: string,
): Promise<{ stdout: string; stderr: string }> {
  log('execNpmWithRetry - commandLine', commandLine);

  const abortController = new AbortController();
  const execWithRetry = retry(
    async (_item: undefined, attempt: number) => {
      log('execNpmWithRetry - attempt', commandLine, attempt);
      try {
        return await exec(commandLine, {
          cwd: workFolder,
          signal: abortController.signal,
        });
      } catch (error) {
        log('execNpmWithRetry - failed', commandLine, attempt, error);
        throw error;
      }
    },
    // worst-case backoff 1+2+4+8+16+32 seconds then 9 x 60 seconds ~= 10 minutes, so retries last the whole window
    { waitRatio: 1000, retries: 15, jitter: true, maximumBackoff: 60_000 },
  );

  try {
    return await timeout(execWithRetry(), {
      timeout: NPM_RETRY_WINDOW_MILLISECONDS,
    });
  } finally {
    // timeout() does not cancel the retry loop, so kill any in-flight npm process and fail the remaining attempts
    abortController.abort();
  }
}

async function retrievePackageJson(
  workFolder: string,
  packageNameAndBetaVersion: string,
): Promise<PackageJson> {
  const execResult = await execNpmWithRetry(
    `npm view ${packageNameAndBetaVersion} --json`,
    workFolder,
  );
  log('retrievePackageJson - execResult', execResult);

  // npm 12+ returns an array even when a single version matches
  const parsedOutput = JSON.parse(execResult.stdout) as
    PackageJson | PackageJson[];
  const packageJson = Array.isArray(parsedOutput)
    ? parsedOutput.at(-1)
    : parsedOutput;
  if (packageJson === undefined) {
    throw new TypeError(`no package found for ${packageNameAndBetaVersion}`);
  }
  log('retrievePackageJson - name', packageJson.name);
  log('retrievePackageJson - version', packageJson.version);
  return packageJson;
}

// create a minimal project with the package as a dependency
async function generateProject(
  workFolder: string,
  packageJson: PackageJson,
): Promise<void> {
  // create package.json with the dependency
  const projectPackageJson = {
    name: 'test',
    version: '0.0.1',
    description:
      'test project for validating a target library or service npm package',
    ...(packageJson.engine === undefined ? {} : { engine: packageJson.engine }),
    type: 'module',
    dependencies: {
      [packageJson.name]: packageJson.version,
    },
  };
  await fs.writeFile(
    `${workFolder}/package.json`,
    JSON.stringify(projectPackageJson, null, 2),
  );
}

async function installDependencies(workFolder: string): Promise<void> {
  const execResult = await execNpmWithRetry(
    'npm i --ignore-scripts',
    workFolder,
  );
  log('installNpmDependencies - execResult', execResult);
}

async function verifyDefaultImport(
  workFolder: string,
  packageName: string,
  importEntryPoint: string,
): Promise<void> {
  const importType = importEntryPoint.endsWith('.json')
    ? ` with { type: 'json' }`
    : '';
  const importStatement = `import '${packageName}'${importType};`;
  const commandLine = `node -e "${importStatement}"`;
  log('verifyDefaultImport - commandLine', commandLine);

  const execResult = await exec(commandLine, { cwd: workFolder });
  log('verifyDefaultImport - execResult', execResult);
}

export default async function (): Promise<void> {
  log('Action start');

  const packageNameAndBetaVersion = getInput('betaPackage');
  log('packageNameAndBetaVersion', packageNameAndBetaVersion);

  // eslint-disable-next-line @checkdigit/no-random-v4-uuid
  const workFolder = path.join(os.tmpdir(), crypto.randomUUID());
  await fs.mkdir(workFolder);
  log('temporary work folder created', workFolder);

  await addNPMRCFile(workFolder);

  const packageJson = await retrievePackageJson(
    workFolder,
    packageNameAndBetaVersion,
  );
  const importEntryPoint =
    packageJson.exports?.['.']?.import ?? packageJson.main;
  if (typeof importEntryPoint !== 'string') {
    throw new TypeError(
      'no import entry point found, or not defined following our standards.',
    );
  }

  await generateProject(workFolder, packageJson);

  await installDependencies(workFolder);

  await verifyDefaultImport(workFolder, packageJson.name, importEntryPoint);

  log('Action end');
}
