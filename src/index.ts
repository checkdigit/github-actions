// index.ts
import process from 'node:process';

import command from './command';
command(process.argv)
  .then(() => {
    process.stdin.destroy();
    // eslint-disable-next-line unicorn/no-process-exit
    process.exit(0);
  })
  // eslint-disable-next-line unicorn/prefer-top-level-await
  .catch(() => {
    // eslint-disable-next-line no-console
    console.log('Action Error - exit 1');
    // eslint-disable-next-line unicorn/no-process-exit
    process.exit(1);
  });
