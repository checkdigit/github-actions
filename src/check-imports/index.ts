// check-imports/index.ts

import process from 'node:process';
import { debug } from 'debug';

import { Descriptor, extractPackageName, getPackageLock, satisfiesNameAndRange } from './package-lock-file-util';
import notAllowed from './packages-not-allowed';

const log = debug('check-imports');
export async function main(): Promise<void | boolean> {
  log('Action starting');

  const { packages } = await getPackageLock(process.cwd());

  log('Reviewing package-lock');
  for (const key in packages) {
    if (Object.hasOwn(packages, key)) {
      const packageVersion = (packages[key] as Descriptor).version;
      const packageName = extractPackageName(key);

      for (const [name, range, reason] of notAllowed) {
        if (satisfiesNameAndRange(packageName, packageVersion, [name, range])) {
          throw new Error(
            `Package ${packageName}@${packageVersion} is not allowed to be imported because it is included in ${JSON.stringify(
              [name, range]
            )}. Package ${name}@${range} is not allowed for the following reason: ${reason}`
          );
        }
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
