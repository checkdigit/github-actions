// package-denier/package-lock-file-util.ts

import path from 'node:path';
import { readFile } from 'node:fs/promises';

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
  packages: { [key: string]: Descriptor };
}

export async function getPackageLock(rootProjectDirectory: string): Promise<PackageLock> {
  const filePath = path.join(rootProjectDirectory, 'package-lock.json');
  return JSON.parse(await readFile(filePath, 'utf8')) as PackageLock;
}

const prefix = 'node_modules/';

export function getPackageNameFromKey(key: string): string {
  return key.slice(key.lastIndexOf(prefix) + prefix.length);
}

function compareSemverVersions(version1: string, version2: string): number {
  const version1Parts = version1.split('.');
  const version2Parts = version2.split('.');

  const length = Math.max(version1Parts.length, version2Parts.length);

  for (let index = 0; index < length; index++) {
    const valueA = Number.parseInt(version1Parts[index] as string, 10);
    const valueB = Number.parseInt(version2Parts[index] as string, 10);

    if (valueA === valueB) {
      continue;
    }

    if (valueA > valueB || Number.isNaN(valueB)) {
      return 1;
    }

    return -1;
  }

  return 0;
}

function isMatchingName(nameA: string, nameB: string): boolean {
  if (nameA.endsWith('*')) {
    return nameB.startsWith(nameA.split('*')[0] as string);
  }

  if (nameB.endsWith('*')) {
    return nameA.startsWith(nameB.split('*')[0] as string);
  }

  return nameA === nameB;
}

export function isInList(packageName: string, version: string, list: [string, string, string][]): boolean {
  for (const item of list) {
    if (isMatchingName(item[0], packageName)) {
      const versionComparison = compareSemverVersions(version, item[2]);

      if (item[1] === '=' && versionComparison === 0) {
        return true;
      }

      switch (item[1]) {
        case '>': {
          return versionComparison === 1;
        }
        case '>=': {
          return versionComparison === 1 || versionComparison === 0;
        }
        case '<': {
          return versionComparison === -1;
        }
        case '<=': {
          return versionComparison === -1 || versionComparison === 0;
        }
        default:
        // Do nothing
      }
    }
  }
  return false;
}
