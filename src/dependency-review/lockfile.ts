// dependency-review/lockfile.ts

/* eslint-disable no-continue, preserve-caught-error, sonarjs/cognitive-complexity */

import { strict as assert } from 'node:assert';

import type { Dependency, DependencyScope } from './types.ts';

interface LockPackage {
  name?: unknown;
  version?: unknown;
  link?: unknown;
  dev?: unknown;
  optional?: unknown;
  peer?: unknown;
  devOptional?: unknown;
  license?: unknown;
  resolved?: unknown;
}

interface PackageLock {
  lockfileVersion?: unknown;
  packages?: unknown;
}

const NODE_MODULES_SEGMENT = 'node_modules/';
const LOCKFILE_VERSION_THREE = 3;

export function npmPurl(name: string, version?: string): string {
  const encodedName = name
    .split('/')
    .map((part) => encodeURIComponent(part))
    .join('/');
  const versionSuffix =
    version === undefined ? '' : `@${encodeURIComponent(version)}`;
  return `pkg:npm/${encodedName}${versionSuffix}`;
}

export function packageNameFromPath(packagePath: string): string {
  const index = packagePath.lastIndexOf(NODE_MODULES_SEGMENT);
  assert.notEqual(index, -1, `Invalid npm install path: ${packagePath}`);
  const remainder = packagePath.slice(index + NODE_MODULES_SEGMENT.length);
  const parts = remainder.split('/');
  const name = remainder.startsWith('@')
    ? parts.slice(0, 2).join('/')
    : parts[0];
  assert.ok(
    name !== undefined && name.length > 0,
    `Unable to determine package name from ${packagePath}`,
  );
  return name;
}

function parseScope(value: LockPackage): DependencyScope {
  return value.dev === true ? 'development' : 'runtime';
}

function classifySource(resolved: string | undefined): Dependency['source'] {
  if (resolved === undefined || resolved.length === 0) {
    return 'npm';
  }
  try {
    const url = new URL(resolved);
    if (
      url.hostname === 'registry.npmjs.org' ||
      url.hostname === 'registry.yarnpkg.com'
    ) {
      return 'npm';
    }
    if (
      url.protocol.startsWith('git') ||
      (url.hostname === 'github.com' && url.pathname.endsWith('.git'))
    ) {
      return 'git';
    }
    return 'remote';
  } catch {
    return resolved.startsWith('git') ? 'git' : 'remote';
  }
}

export function parsePackageLock(
  content: string,
  manifest: string,
): Dependency[] {
  let parsed: PackageLock;
  try {
    parsed = JSON.parse(content) as PackageLock;
  } catch (error) {
    throw new Error(`Invalid JSON in ${manifest}: ${String(error)}`);
  }

  if (
    parsed.lockfileVersion !== 2 &&
    parsed.lockfileVersion !== LOCKFILE_VERSION_THREE
  ) {
    throw new Error(
      `${manifest} uses unsupported lockfileVersion ${String(parsed.lockfileVersion)}; only npm lockfile versions 2 and 3 are supported`,
    );
  }
  if (
    parsed.packages === null ||
    typeof parsed.packages !== 'object' ||
    Array.isArray(parsed.packages)
  ) {
    throw new Error(`${manifest} does not contain a valid packages object`);
  }

  const dependencies: Dependency[] = [];
  for (const [packagePath, rawValue] of Object.entries(parsed.packages)) {
    if (
      !packagePath.includes(NODE_MODULES_SEGMENT) ||
      rawValue === null ||
      typeof rawValue !== 'object' ||
      Array.isArray(rawValue)
    ) {
      continue;
    }
    const value = rawValue as LockPackage;
    if (value.link === true) {
      continue;
    }
    if (
      typeof value.resolved === 'string' &&
      (value.resolved.startsWith('file:') || value.resolved.startsWith('link:'))
    ) {
      continue;
    }
    const name =
      typeof value.name === 'string' && value.name.length > 0
        ? value.name
        : packageNameFromPath(packagePath);
    if (typeof value.version !== 'string' || value.version.length === 0) {
      if (value.optional === true && value.peer === true) {
        continue;
      }
      throw new Error(
        `${manifest} entry ${packagePath} has no external package version`,
      );
    }
    const scope = parseScope(value);
    const resolved =
      typeof value.resolved === 'string' && value.resolved.length > 0
        ? value.resolved
        : undefined;
    dependencies.push({
      manifest,
      path: packagePath,
      name,
      version: value.version,
      scope,
      optional: value.optional === true,
      ...(typeof value.license === 'string' && value.license.trim().length > 0
        ? { license: value.license.trim() }
        : {}),
      purl: npmPurl(name, value.version),
      source: classifySource(resolved),
      ...(resolved === undefined ? {} : { resolved }),
    });
  }

  return dependencies.sort((left, right) =>
    `${left.manifest}\0${left.path}`.localeCompare(
      `${right.manifest}\0${right.path}`,
    ),
  );
}

/* eslint-enable no-continue, preserve-caught-error, sonarjs/cognitive-complexity */
