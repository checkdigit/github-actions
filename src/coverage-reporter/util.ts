// coverage-reporter/util.ts

/**
 * Based on code from lcov-report-action, see LICENSE.lcov-reporter-action.txt.
 * https://github.com/romeovs/lcov-reporter-action
 */

import path from 'node:path';
import { strict as assert } from 'node:assert';

import type { Options } from './options';

export function normalizePath(file: string): string {
  return file.replaceAll('\\', '/');
}

export function createHref(options: Options, file: { file: string }): { href: string; filename: string } {
  const relative = file.file.replace(options.prefix, '');
  const parts = relative.split('/');
  const filename = parts.at(-1);
  assert.ok(filename, 'Filename is missing');
  const url = path.join(options.repository, 'blob', options.commit, options.workingDir ?? './', relative);
  return {
    href: `https://github.com/${url}`,
    filename,
  };
}
