// check-imports/package-lock-file-util.ts

import path from 'node:path';
import { readFile } from 'node:fs/promises';
import * as semver from 'semver';
import type { Name, Range } from './packages-not-allowed';

export interface Descriptor {
  version: string;
  resolved: string;
  integrity: string;
  link: boolean;
  dev: boolean;
  optional: boolean;
  devOptional: boolean;
  inBundle: boolean;
  hasInstallScript: boolean;
  hasShrinkwrap: boolean;
  bin: string;
  license: string;
  engines: object;
  dependencies: object;
  devDependencies: object;
  optionalDependencies: object;
}

export interface PackageLock {
  name: string;
  version: string;
  lockfileVersion: number;
  packages: Record<string, Descriptor>;
}

export async function getPackageLock(rootProjectDirectory: string): Promise<PackageLock> {
  const filePath = path.join(rootProjectDirectory, 'package-lock.json');
  return JSON.parse(await readFile(filePath, 'utf8')) as PackageLock;
}

const prefix = 'node_modules/';

export function extractPackageName(key: string): string {
  return key.slice(key.lastIndexOf(prefix) + prefix.length);
}

export function isMatchingName(nameA: string, nameB: string): boolean {
  if (nameA.endsWith('*')) {
    return nameB.startsWith(nameA.slice(0, -1));
  }

  if (nameB.endsWith('*')) {
    return nameA.startsWith(nameB.slice(0, -1));
  }

  return nameA === nameB;
}

export function satisfiesNameAndRange(
  packageName: string,
  packageVersion: string,
  [name, range]: [Name, Range],
): boolean {
  return isMatchingName(packageName, name) && semver.satisfies(packageVersion, range);
}
