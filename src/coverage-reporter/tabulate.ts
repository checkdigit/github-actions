// coverage-reporter/tabulate.ts

/**
 * Based on code from lcov-report-action, see LICENSE.lcov-reporter-action.txt.
 * https://github.com/romeovs/lcov-reporter-action
 */

import { a, b, fragment, table, tbody, td, th, tr } from './html';
import type { Lcov, LcovFile } from './lcov';
import type { Options } from './options';
import { createHref, normalizePath } from './util';

function shouldBeIncluded(fileName: string, options: Options) {
  if (options.shouldFilterChangedFiles !== true) {
    return true;
  }
  return options.changedFiles?.includes(fileName.replace(options.prefix, ''));
}

function filterAndNormalizeLcov(lcov: Lcov, options: Options) {
  return lcov
    .map((file) => ({
      ...file,
      file: normalizePath(file.file),
    }))
    .filter((file) => shouldBeIncluded(file.file, options));
}

function toFolder(path: string) {
  if (path === '') {
    return '';
  }

  return tr(td({ colspan: 6 }, b(path)));
}

function getStatement(file: LcovFile) {
  const { branches, functions, lines } = file;

  // eslint-disable-next-line unicorn/no-array-reduce
  return [branches, functions, lines].reduce(
    (accumulator, current) => {
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition, @typescript-eslint/strict-boolean-expressions
      if (!current) {
        return accumulator;
      }

      return {
        hit: accumulator.hit + current.hit,
        found: accumulator.found + current.found,
      };
    },
    { hit: 0, found: 0 },
  );
}

function filename(file: LcovFile, indent: boolean, options: Options) {
  // eslint-disable-next-line @typescript-eslint/no-shadow
  const { href, filename } = createHref(options, file);
  const space = indent ? '&nbsp; &nbsp;' : '';
  return fragment(space, a({ href }, filename));
}

function percentage(item: { hit: number; found: number } | undefined) {
  if (!item) {
    return 'N/A';
  }

  // eslint-disable-next-line no-magic-numbers
  const value = item.found === 0 ? 100 : (item.hit / item.found) * 100;
  const rounded = value.toFixed(2).replaceAll(/\.0*$/gu, ''); // remove trailing zeros after the decimal point

  // eslint-disable-next-line no-magic-numbers
  const tag = value === 100 ? fragment : b;

  return tag(`${rounded}%`);
}

function ranges(lineNumbers: number[]) {
  const result = [];

  let last = null;

  for (const lineno of lineNumbers.sort()) {
    if (last === null) {
      last = { start: lineno, end: lineno };
      // eslint-disable-next-line no-continue
      continue;
    }

    if (last.end + 1 === lineno) {
      last.end = lineno;
      // eslint-disable-next-line no-continue
      continue;
    }

    result.push(last);
    last = { start: lineno, end: lineno };
  }

  if (last) {
    result.push(last);
  }

  return result;
}

function uncovered(file: LcovFile, options: Options) {
  // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions, @typescript-eslint/no-unnecessary-condition
  const branches = (file.branches ? file.branches.details : [])
    .filter((branch) => branch.taken === 0)
    .map((branch) => branch.line);

  // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions, @typescript-eslint/no-unnecessary-condition
  const lines = (file.lines ? file.lines.details : []).filter((line) => line.hit === 0).map((line) => line.line);

  const all = ranges([...branches, ...lines]);

  return all
    .map((range) => {
      const uncoveredFragment = range.start === range.end ? `L${range.start}` : `L${range.start}-L${range.end}`;
      const { href } = createHref(options, file);
      const text = range.start === range.end ? range.start : `${range.start}&ndash;${range.end}`;

      return a({ href: `${href}#${uncoveredFragment}` }, text);
    })
    .join(', ');
}

function toRow(file: LcovFile, indent: boolean, options: Options) {
  return tr(
    td(filename(file, indent, options)),
    td(percentage(getStatement(file))),
    td(percentage(file.branches)),
    td(percentage(file.functions)),
    td(percentage(file.lines)),
    td(uncovered(file, options)),
  );
}

// Tabulate the lcov data in an HTML table.
export function tabulate(lcov: Lcov, options: Options): string {
  const head = tr(th('File'), th('Stmts'), th('Branches'), th('Funcs'), th('Lines'), th('Uncovered Lines'));

  const folders = {} as Record<string, LcovFile[]>;
  for (const file of filterAndNormalizeLcov(lcov, options)) {
    const parts = file.file.replace(options.prefix, '').split('/');
    const folder = parts.slice(0, -1).join('/');
    (folders[folder] ??= []).push(file);
  }

  const rows = Object.keys(folders)
    .sort()
    // eslint-disable-next-line unicorn/no-array-reduce
    .reduce(
      (accumulator: unknown[], key: string) => [
        ...accumulator,
        toFolder(key),
        ...(folders[key]?.map((file) => toRow(file, key !== '', options)) ?? []),
      ],
      [],
    );

  return table(tbody(head, ...rows));
}
