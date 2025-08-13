// coverage-reporter/comment.ts

/**
 * Based on code from lcov-report-action, see LICENSE.lcov-reporter-action.txt.
 * https://github.com/romeovs/lcov-reporter-action
 */

import { b, details, fragment, h2, summary, table, tbody, th, tr } from './html.ts';

import { type Lcov, percentage } from './lcov.ts';
import type { Options } from './options.ts';
import { tabulate } from './tabulate.ts';

export function comment(lcov: Lcov, options: Options): string {
  return fragment(
    options.title !== undefined && options.title !== '' ? h2(options.title) : '',
    options.base !== undefined && options.base !== ''
      ? `Coverage after merging ${b(options.head)} into ${b(options.base)} will be`
      : `Coverage for this commit`,
    table(tbody(tr(th(percentage(lcov).toFixed(2), '%')))),
    '\n\n',
    details(
      summary(options.shouldFilterChangedFiles === true ? 'Coverage Report for Changed Files' : 'Coverage Report'),
      tabulate(lcov, options),
    ),
  );
}

export function diff(lcov: Lcov, before: Lcov | undefined, options: Options): string {
  if (!before) {
    return comment(lcov, options);
  }

  const pbefore = percentage(before);
  const pafter = percentage(lcov);
  const pdiff = pafter - pbefore;
  const plus = pdiff > 0 ? '+' : '';
  const arrow = pdiff === 0 ? '' : pdiff < 0 ? '▾' : '▴';

  return fragment(
    options.title !== undefined && options.title !== '' ? h2(options.title) : '',
    options.base !== undefined && options.base !== ''
      ? `Coverage after merging ${b(options.head)} into ${b(options.base)} will be`
      : `Coverage for this commit`,
    table(tbody(tr(th(pafter.toFixed(2), '%'), th(arrow, ' ', plus, pdiff.toFixed(2), '%')))),
    '\n\n',
    details(
      summary(options.shouldFilterChangedFiles === true ? 'Coverage Report for Changed Files' : 'Coverage Report'),
      tabulate(lcov, options),
    ),
  );
}
