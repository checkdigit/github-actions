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

// eslint-disable-next-line @checkdigit/no-side-effects
export const details: (...children: unknown[]) => string = tag('details');
// eslint-disable-next-line @checkdigit/no-side-effects
export const summary: (...children: unknown[]) => string = tag('summary');
// eslint-disable-next-line @checkdigit/no-side-effects
export const tr: (...children: unknown[]) => string = tag('tr');
// eslint-disable-next-line @checkdigit/no-side-effects
export const td: (...children: unknown[]) => string = tag('td');
// eslint-disable-next-line @checkdigit/no-side-effects
export const th: (...children: unknown[]) => string = tag('th');
// eslint-disable-next-line id-length, @checkdigit/no-side-effects
export const b: (...children: unknown[]) => string = tag('b');
// eslint-disable-next-line @checkdigit/no-side-effects
export const table: (...children: unknown[]) => string = tag('table');
// eslint-disable-next-line @checkdigit/no-side-effects
export const tbody: (...children: unknown[]) => string = tag('tbody');
// eslint-disable-next-line id-length, @checkdigit/no-side-effects
export const a: (...children: unknown[]) => string = tag('a');
// eslint-disable-next-line @checkdigit/no-side-effects
export const span: (...children: unknown[]) => string = tag('span');
// eslint-disable-next-line @checkdigit/no-side-effects
export const h2: (...children: unknown[]) => string = tag('h2');

export function fragment(...children: string[]): string {
  return children.join('');
}
