// prepare-beta/github.ts
import process from 'node:process';
import { debug } from 'debug';

const log = debug('publish-beta:github');

export function getPRNumber(): string {
  const prNumberSearch = process.env['GITHUB_REF']?.match(/[0-9]+/gu);
  if (!prNumberSearch || prNumberSearch[0] === undefined) {
    log('unable to get PR number - Is process.env.GITHUB_REF set correctly?');
    throw new Error('unable to get PR number');
  }
  return prNumberSearch[0];
}
