// check-label/check-label.ts

import path from 'node:path';
import { strict as assert } from 'node:assert';
import { readFile } from 'node:fs/promises';

import debug from 'debug';
import semver from 'semver';
import { parse } from 'yaml';

import { getFileFromMain, getLabelsOnPR } from '../github-api/index.ts';

const log = debug('github-actions:check-label');

export interface PackageJSON {
  name: string;
  version: string;
  files: string[];
  service?: {
    api?: {
      root: string;
      endpoints: string[];
    };
  };
}

type VersionBump = 'patch' | 'minor' | 'major';

async function getLocalPackageJson(fileName: string): Promise<PackageJSON> {
  const packageJSONPath = path.join(process.cwd(), fileName);
  const readPackageJson = await readFile(packageJSONPath, 'utf8');

  return JSON.parse(readPackageJson) as PackageJSON;
}

export function resolveSwaggerPaths(packageJson: PackageJSON): string[] {
  const api = packageJson.service?.api;
  if (api === undefined) {
    return [];
  }

  return api.endpoints.map((endpoint) =>
    path.posix.join(api.root, endpoint, 'swagger.yml'),
  );
}

function getInfoVersion(swagger: string, swaggerPath: string): string {
  let document: unknown;
  try {
    document = parse(swagger);
  } catch (error) {
    throw new Error(`${swaggerPath}: unable to parse YAML`, { cause: error });
  }
  if (typeof document !== 'object' || document === null) {
    throw new Error(`${swaggerPath}: expected a YAML object`);
  }
  const info = (document as Record<string, unknown>)['info'];
  if (typeof info !== 'object' || info === null) {
    throw new Error(`${swaggerPath}: expected info to be an object`);
  }
  const version = (info as Record<string, unknown>)['version'];
  if (typeof version !== 'string' || version === '') {
    throw new Error(`${swaggerPath}: info.version must be a non-empty string`);
  }
  return version;
}

function getValidSwaggerVersion(
  swagger: string,
  swaggerPath: string,
  source: 'branch' | 'main',
): semver.SemVer {
  const version = getInfoVersion(swagger, swaggerPath);
  const parsedVersion = semver.parse(version);
  if (parsedVersion === null) {
    throw new Error(
      `${swaggerPath}: ${source} info.version "${version}" is not valid semver`,
    );
  }
  return parsedVersion;
}

function getSwaggerBump(
  mainVersion: semver.SemVer,
  branchVersion: semver.SemVer,
): VersionBump {
  if (branchVersion.major > mainVersion.major) {
    return 'major';
  }
  if (branchVersion.minor > mainVersion.minor) {
    return 'minor';
  }
  return 'patch';
}

function getBumpSeverity(bump: string): number {
  if (bump === 'patch') {
    return 0;
  }
  if (bump === 'minor') {
    return 1;
  }
  if (bump === 'major') {
    return 2;
  }
  throw new Error(`Invalid package bump label: ${bump}`);
}

export function validateSwaggerChange(
  swaggerPath: string,
  branchSwagger: string,
  mainSwagger: string,
  packageBump: string,
): void {
  if (branchSwagger === mainSwagger) {
    return;
  }

  const branchVersion = getValidSwaggerVersion(
    branchSwagger,
    swaggerPath,
    'branch',
  );
  const mainVersion = getValidSwaggerVersion(mainSwagger, swaggerPath, 'main');
  const branchVersionRaw = branchVersion.raw;
  const mainVersionRaw = mainVersion.raw;
  if (!semver.gt(branchVersion, mainVersion)) {
    throw new Error(
      `${swaggerPath}: Swagger changed but branch info.version ${branchVersionRaw} is not greater than main info.version ${mainVersionRaw}`,
    );
  }
  const swaggerBump = getSwaggerBump(mainVersion, branchVersion);
  if (getBumpSeverity(packageBump) < getBumpSeverity(swaggerBump)) {
    throw new Error(
      `${swaggerPath}: ${swaggerBump} Swagger version bump from ${mainVersionRaw} to ${branchVersionRaw} requires at least a ${swaggerBump} package.json bump/PR label; received ${packageBump}`,
    );
  }
}

function isNotFoundError(error: unknown): boolean {
  const httpNotFound = 404;
  return (
    typeof error === 'object' &&
    error !== null &&
    'status' in error &&
    error.status === httpNotFound
  );
}

async function validateSwaggers(
  branchPackageJson: PackageJSON,
  packageBump: string,
): Promise<void> {
  for (const swaggerPath of resolveSwaggerPaths(branchPackageJson)) {
    let branchSwagger: string;
    try {
      // eslint-disable-next-line no-await-in-loop
      branchSwagger = await readFile(
        path.join(process.cwd(), swaggerPath),
        'utf8',
      );
    } catch (error) {
      throw new Error(`Unable to read branch Swagger ${swaggerPath}`, {
        cause: error,
      });
    }

    let mainSwagger: string | undefined;
    let isNewSwagger = false;
    try {
      // eslint-disable-next-line no-await-in-loop
      mainSwagger = await getFileFromMain(swaggerPath);
    } catch (error) {
      if (isNotFoundError(error)) {
        isNewSwagger = true;
      } else {
        throw new Error(`Unable to get Swagger ${swaggerPath} from main`, {
          cause: error,
        });
      }
    }
    if (isNewSwagger) {
      getValidSwaggerVersion(branchSwagger, swaggerPath, 'branch');
    } else if (mainSwagger === undefined) {
      throw new Error(`Unable to get Swagger ${swaggerPath} from main`);
    } else {
      validateSwaggerChange(
        swaggerPath,
        branchSwagger,
        mainSwagger,
        packageBump,
      );
    }
  }
}

export function validateVersion(
  branchPackageJsonVersion: string,
  mainPackageJsonVersion: string,
  prLabel: string,
): true {
  if (semver.gt(mainPackageJsonVersion, branchPackageJsonVersion)) {
    log(
      `Main branch version: ${mainPackageJsonVersion} vs branch version: ${branchPackageJsonVersion}`,
    );
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
  assert.equal(
    branchPackageJsonVersion,
    expectedVersion,
    'Version is incorrect based on Pull Request label',
  );
  return true;
}

export default async function (): Promise<void> {
  log('Action start');

  const labelsPullRequest = await getLabelsOnPR();
  if (labelsPullRequest.length > 1) {
    throw new Error('PR has more than one label');
  }
  const label = labelsPullRequest[0]?.toLowerCase();
  assert.ok(label !== undefined, 'Unable to get label from PR');

  const branchPackageJson = await getLocalPackageJson('package.json');
  const branchPackageJsonVersion = branchPackageJson.version;
  const mainPackageJsonVersionRaw = await getFileFromMain('package.json');

  if (mainPackageJsonVersionRaw === undefined) {
    throw new Error('Unable to get package.json from main branch');
  }
  const mainPackageJsonVersion = JSON.parse(
    mainPackageJsonVersionRaw,
  ) as PackageJSON;

  validateVersion(
    branchPackageJsonVersion,
    mainPackageJsonVersion.version,
    label,
  );

  const branchLockFile = await getLocalPackageJson('package-lock.json');
  assert.equal(
    branchPackageJsonVersion,
    branchLockFile.version,
    'package.json and package-lock.json versions do not match',
  );

  await validateSwaggers(branchPackageJson, label);

  log('Action end');
}
