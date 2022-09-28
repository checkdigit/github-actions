// coverage-reporter/html.ts

/**
 * Based on code from lcov-report-action, see LICENSE.lcov-reporter-action.txt.
 * https://github.com/romeovs/lcov-reporter-action
 */

function tag(name: string) {
  return function (...children: unknown[]) {
    const properties =
      typeof children[0] === 'object'
        ? Object.keys(children[0] as Record<string, unknown>)
            .map((key) => ` ${key}='${(children[0] as Record<string, unknown>)[key] as string}'`)
            .join('')
        : '';

    const child = typeof children[0] === 'string' ? children : children.slice(1);

    return `<${name}${properties}>${child.join('')}</${name}>`;
  };
}

export const details = tag('details');
export const summary = tag('summary');
export const tr = tag('tr');
export const td = tag('td');
export const th = tag('th');
// eslint-disable-next-line id-length
export const b = tag('b');
export const table = tag('table');
export const tbody = tag('tbody');
// eslint-disable-next-line id-length
export const a = tag('a');
export const span = tag('span');
export const h2 = tag('h2');

export function fragment(...children: string[]): string {
  return children.join('');
}
