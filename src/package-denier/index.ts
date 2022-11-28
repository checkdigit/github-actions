// package-denier/index.ts

import process from 'node:process';
import { debug } from 'debug';

import { Descriptor, getPackageLock, getPackageNameFromKey, isInList } from './package-lock-file-util';
import notAllowed from './not-allowed';

const log = debug('package-denier');
export async function main(): Promise<void | boolean> {
  log('Action starting');

  const { packages } = await getPackageLock(process.cwd());

  log('Reviewing package-lock');
  for (const key in packages) {
    if (Object.hasOwn(packages, key)) {
      const version = (packages[key] as Descriptor).version;
      const packageName = getPackageNameFromKey(key);
      if (isInList(packageName, version, notAllowed)) {
        throw new Error(`Package ${key}@${version} is not allowed`);
      }
    }
  }
}

main()
  .then(() => {
    process.stdin.destroy();
    // eslint-disable-next-line unicorn/no-process-exit
    process.exit(0);
  })
  // eslint-disable-next-line unicorn/prefer-top-level-await
  .catch((error) => {
    // eslint-disable-next-line no-console
    console.log('Action Error - exit 1 - error:', error);
    // eslint-disable-next-line unicorn/no-process-exit
    process.exit(1);
  });
