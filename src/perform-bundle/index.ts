// perform-bundle/index.ts

import { readFile } from 'node:fs/promises';
import debug from 'debug';
import type { Metafile } from 'esbuild';

import { publishCommentAndRemovePrevious } from '../github-api';
import runDeployer from './deployer';
import analyze from './analyze';

const log = debug('github-actions:perform-bundle');

function bytesToKB(bytes: number) {
  return Math.round(bytes / 1024);
}

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
    `Bundle created - Total size ${bytesToKB(results.totalBytes)} KB - source ${bytesToKB(
      results.sourceBytes,
    )} KB - modules ${bytesToKB(results.moduleBytes)} KB`,
    'Bundle created ',
  );
}

await main();
