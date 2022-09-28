// coverage-reporter/lcov.spec.ts

/**
 * Based on code from lcov-parse and lcov-report-action, see LICENSE.lcov-parse.txt and LICENSE.lcov-reporter-action.txt.
 * https://github.com/davglass/lcov-parse
 * https://github.com/romeovs/lcov-reporter-action
 */

import { strict as assert } from 'node:assert';

import { parse, percentage } from './lcov';

const example = `
TN:
SF:/files/project/foo.js
FN:19,foo
FN:33,bar
FN:54,baz
FNF:3
FNH:2
DA:20,3
DA:21,3
DA:22,3
LF:23
LH:21
BRDA:21,0,0,1
BRDA:21,0,1,2
BRDA:22,1,0,1
BRDA:22,1,1,2
BRDA:37,2,0,0
BRF:5
BRH:4
end_of_record
`;

describe('lcov', () => {
  it('parse should parse lcov strings correctly', async () => {
    assert.deepEqual(parse(example), [
      {
        title: '',
        file: '/files/project/foo.js',
        lines: {
          found: 23,
          hit: 21,
          details: [
            {
              line: 20,
              hit: 3,
            },
            {
              line: 21,
              hit: 3,
            },
            {
              line: 22,
              hit: 3,
            },
          ],
        },
        functions: {
          hit: 2,
          found: 3,
          details: [
            {
              name: 'foo',
              line: 19,
            },
            {
              name: 'bar',
              line: 33,
            },
            {
              name: 'baz',
              line: 54,
            },
          ],
        },
        branches: {
          hit: 4,
          found: 5,
          details: [
            {
              line: 21,
              block: 0,
              branch: 0,
              taken: 1,
            },
            {
              line: 21,
              block: 0,
              branch: 1,
              taken: 2,
            },
            {
              line: 22,
              block: 1,
              branch: 0,
              taken: 1,
            },
            {
              line: 22,
              block: 1,
              branch: 1,
              taken: 2,
            },
            {
              line: 37,
              block: 2,
              branch: 0,
              taken: 0,
            },
          ],
        },
      },
    ]);
  });

  it('parse should fail on invalid lcov', async () => {
    assert.throws(() => parse('invalid'), { message: 'Failed to parse string' });
  });

  it('percentage should calculate the correct percentage', () => {
    assert.equal(
      percentage([{ lines: { hit: 20, found: 25, details: [] } }, { lines: { hit: 10, found: 15, details: [] } }]),
      75
    );
  });
});
