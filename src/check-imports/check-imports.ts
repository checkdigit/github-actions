// check-imports/check-imports.ts

import { strict as assert } from 'node:assert';

import debug from 'debug';

import { extractPackageName, getPackageLock, satisfiesNameAndRange } from './package-lock-file-util';
import notAllowed from './packages-not-allowed';

const log = debug('github-actions:check-imports');

export default async function main(): Promise<void> {
  log('Action starting');

  const { packages } = await getPackageLock(process.cwd());

  log('Reviewing package-lock');
  for (const key in packages) {
    if (Object.hasOwn(packages, key)) {
      const descriptor = packages[key];
      assert.ok(descriptor !== undefined, 'Package version is missing');
      const packageVersion = descriptor.version;
      const packageName = extractPackageName(key);

      for (const [name, range, reason] of notAllowed) {
        if (satisfiesNameAndRange(packageName, packageVersion, [name, range])) {
          throw new Error(
            `Package ${packageName}@${packageVersion} is not allowed to be imported because it is included in ${JSON.stringify(
              [name, range],
            )}. Package ${name}@${range} is not allowed for the following reason: ${reason}`,
          );
        }
      }
    }
  }

  log('Action end');
}
