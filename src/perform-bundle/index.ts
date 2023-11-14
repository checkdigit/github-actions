// perform-bundle/index.ts

import process from 'node:process';
import { readFile } from 'node:fs/promises';
import { debug } from 'debug';
import type { Metafile } from 'esbuild';

import { publishCommentAndRemovePrevious } from '../github-api';
import runDeployer from './deployer';
import analyze from './analyze';

const log = debug('perform-bundle');

async function readMetaDataFile(): Promise<Metafile> {
  try {
    const rawFile = await readFile('esbuild-lambda/metafile.json', 'utf8');
    return JSON.parse(rawFile) as Metafile;
  } catch (error) {
    log('Exception thrown attempting to read meta data file: ', JSON.stringify(error));
    throw error;
  }
}

export async function main(): Promise<void> {
  log('Action start');
  await runDeployer();
  const metaDataFile = await readMetaDataFile();
  const results = analyze(metaDataFile);
  await publishCommentAndRemovePrevious(
    `Bundle created - Total size ${results.totalBytes} bytes - source ${results.sourceBytes} bytes - modules ${results.moduleBytes} bytes`,
    'Bundle created '
  );
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
