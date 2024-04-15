// coverage-reporter/html.spec.ts

/**
 * Based on code from lcov-report-action, see LICENSE.lcov-reporter-action.txt.
 * https://github.com/romeovs/lcov-reporter-action
 */

import { strict as assert } from 'node:assert';

import { describe, it } from '@jest/globals';

import { a, b, details, fragment, span, summary, table, tbody, td, th, tr } from './html';

describe('html', () => {
  it('html tags should return the correct html', () => {
    assert.equal(details('foo', 'bar'), '<details>foobar</details>');
    assert.equal(summary('foo', 'bar'), '<summary>foobar</summary>');
    assert.equal(tr('foo', 'bar'), '<tr>foobar</tr>');
    assert.equal(td('foo', 'bar'), '<td>foobar</td>');
    assert.equal(th('foo', 'bar'), '<th>foobar</th>');
    assert.equal(b('foo', 'bar'), '<b>foobar</b>');
    assert.equal(table('foo', 'bar'), '<table>foobar</table>');
    assert.equal(tbody('foo', 'bar'), '<tbody>foobar</tbody>');
    assert.equal(a('foo', 'bar'), '<a>foobar</a>');
    assert.equal(span('foo', 'bar'), '<span>foobar</span>');
  });

  it('html fragment should return the children', () => {
    assert.equal(fragment(), '');
    assert.equal(fragment('foo'), 'foo');
    assert.equal(fragment('foo', 'bar'), 'foobar');
  });

  it('html tags should accept props', () => {
    assert.equal(a({ href: 'http://www.example.com' }, 'example'), "<a href='http://www.example.com'>example</a>");
    assert.equal(
      a({ href: 'http://www.example.com', target: '_blank' }, 'example'),
      "<a href='http://www.example.com' target='_blank'>example</a>",
    );
  });
});
