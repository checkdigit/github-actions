// coverage-reporter/util.ts

/**
 * Based on code from lcov-report-action, see LICENSE.lcov-reporter-action.txt.
 * https://github.com/romeovs/lcov-reporter-action
 */

import path from 'node:path';

import type { Options } from './options';

export function normalisePath(file: string): string {
  return file.replace(/\\/gu, '/');
}

export function createHref(options: Options, file: { file: string }): { href: string; filename: string } {
  const relative = file.file.replace(options.prefix, '');
  const parts = relative.split('/');
  const filename = parts[parts.length - 1] as string;
  const url = path.join(options.repository, 'blob', options.commit, options.workingDir || './', relative);
  return {
    href: `https://github.com/${url}`,
    filename,
  };
}
