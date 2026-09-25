// validate-npm-package/validate-npm-package.ts

import os from 'node:os';
import path from 'node:path';
import { promises as fs } from 'node:fs';
import childProcess from 'node:child_process';
import { setTimeout } from 'node:timers/promises';
import { promisify } from 'node:util';

import { getInput, info } from '@actions/core';
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
const NPM_RETRY_INTERVAL_MILLISECONDS = 30 * 1000;

async function execNpmWithRetry(
  commandLine: string,
  workFolder: string,
  cancelSignal: AbortSignal | undefined,
): Promise<{ stdout: string; stderr: string }> {
  // one signal bounds both the npm process and the retry sleep, so nothing keeps running once the window closes or the caller cancels
  const retryWindowSignal = AbortSignal.any([
    AbortSignal.timeout(NPM_RETRY_WINDOW_MILLISECONDS),
    ...(cancelSignal === undefined ? [] : [cancelSignal]),
  ]);
  for (let attempt = 0; ; attempt++) {
    try {
      if (attempt > 0) {
        // eslint-disable-next-line no-await-in-loop
        await setTimeout(NPM_RETRY_INTERVAL_MILLISECONDS, undefined, {
          signal: retryWindowSignal,
        });
      }
      info(`${commandLine} - attempt ${attempt.toString()}`);
      // eslint-disable-next-line no-await-in-loop
      return await exec(commandLine, {
        cwd: workFolder,
        signal: retryWindowSignal,
      });
    } catch (error) {
      info(
        `${commandLine} - attempt ${attempt.toString()} failed: ${String(error)}`,
      );
      log('execNpmWithRetry - failed', commandLine, attempt, error);
      if (cancelSignal?.aborted === true) {
        throw error;
      }
      if (retryWindowSignal.aborted) {
        throw new Error(
          `${commandLine} did not succeed within ${NPM_RETRY_WINDOW_MILLISECONDS.toString()}ms`,
          { cause: error },
        );
      }
    }
  }
}

async function retrievePackageJson(
  workFolder: string,
  packageNameAndBetaVersion: string,
  cancelSignal: AbortSignal | undefined,
): Promise<PackageJson> {
  const execResult = await execNpmWithRetry(
    `npm view ${packageNameAndBetaVersion} --json`,
    workFolder,
    cancelSignal,
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
  info(`retrieved package ${packageJson.name}@${packageJson.version}`);
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
    ...(packageJson.engine !== undefined && { engine: packageJson.engine }),
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

async function installDependencies(
  workFolder: string,
  cancelSignal: AbortSignal | undefined,
): Promise<void> {
  const execResult = await execNpmWithRetry(
    'npm i --ignore-scripts',
    workFolder,
    cancelSignal,
  );
  log('installNpmDependencies - execResult', execResult);
  info('dependencies installed');
}

async function verifyDefaultImport(
  workFolder: string,
  packageName: string,
  importEntryPoint: string,
  cancelSignal: AbortSignal | undefined,
): Promise<void> {
  const importType = importEntryPoint.endsWith('.json')
    ? ` with { type: 'json' }`
    : '';
  const importStatement = `import '${packageName}'${importType};`;
  const commandLine = `node -e "${importStatement}"`;
  info(`verifying default import: ${commandLine}`);

  const execResult = await exec(commandLine, {
    cwd: workFolder,
    signal: cancelSignal,
  });
  log('verifyDefaultImport - execResult', execResult);
  info('default import verified');
}

// tests pass their t.signal so a timed-out test kills its npm processes instead of running out the retry window
export default async function (cancelSignal?: AbortSignal): Promise<void> {
  const packageNameAndBetaVersion = getInput('betaPackage');
  info(`validating ${packageNameAndBetaVersion}`);

  // eslint-disable-next-line @checkdigit/no-random-v4-uuid
  const workFolder = path.join(os.tmpdir(), crypto.randomUUID());
  await fs.mkdir(workFolder);
  info(`temporary work folder created: ${workFolder}`);

  await addNPMRCFile(workFolder);

  const packageJson = await retrievePackageJson(
    workFolder,
    packageNameAndBetaVersion,
    cancelSignal,
  );
  const importEntryPoint =
    packageJson.exports?.['.']?.import ?? packageJson.main;
  if (typeof importEntryPoint !== 'string') {
    throw new TypeError(
      'no import entry point found, or not defined following our standards.',
    );
  }

  await generateProject(workFolder, packageJson);

  await installDependencies(workFolder, cancelSignal);

  await verifyDefaultImport(
    workFolder,
    packageJson.name,
    importEntryPoint,
    cancelSignal,
  );

  info(`${packageNameAndBetaVersion} validated`);
}
