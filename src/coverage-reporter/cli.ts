// coverage-reporter/cli.ts

/**
 * Based on code from lcov-report-action, see LICENSE.lcov-reporter-action.txt.
 * https://github.com/romeovs/lcov-reporter-action
 */

import process from 'node:process';
import { promises as fs } from 'node:fs';
import path from 'node:path';

import { parse } from './lcov';
import { diff } from './comment';

async function main() {
  const file = process.argv[2] as string;
  // eslint-disable-next-line no-magic-numbers
  const beforeFile = process.argv[3];
  const prefix = `${path.dirname(path.dirname(path.resolve(file)))}/`;

  const content = await fs.readFile(file, 'utf8');
  const lcov = parse(content);

  let before;
  if (beforeFile) {
    before = parse(await fs.readFile(beforeFile, 'utf8'));
  }

  const options = {
    repository: 'example/foo',
    commit: 'f9d42291812ed03bb197e48050ac38ac6befe4e5',
    prefix,
    head: 'feat/test',
    base: 'master',
  };

  // eslint-disable-next-line no-console
  console.log(diff(lcov, before, options));
}

// eslint-disable-next-line unicorn/prefer-top-level-await
main().catch((error) => {
  // eslint-disable-next-line no-console
  console.log(error);
  // eslint-disable-next-line unicorn/no-process-exit
  process.exit(1);
});
