// coverage-reporter/lcov.ts

/**
 * Based on code from lcov-parse and lcov-report-action, see LICENSE.lcov-parse.txt and LICENSE.lcov-reporter-action.txt.
 * https://github.com/davglass/lcov-parse
 * https://github.com/romeovs/lcov-reporter-action
 */

interface LcovLine {
  line: number;
  hit: number;
}
/**
 * Function coverage detail
 */
export interface LcovFunction {
  name: string;
  line: number;
  hit?: number;
}
/**
 * Branch coverage detail
 */
export interface LcovBranch {
  line: number;
  block: number;
  branch: number;
  taken: number;
}
/**
 * Code coverage for lines, functions or branches in a file
 */
export interface LcovPart<T> {
  hit: number;
  found: number;
  details: T[];
}
/**
 * Code coverage for a file
 */
export interface LcovFile {
  title?: string;
  file: string;
  lines: LcovPart<LcovLine>;
  functions: LcovPart<LcovFunction>;
  branches: LcovPart<LcovBranch>;
}

export type Lcov = LcovFile[];

function emptyItem(): LcovFile {
  return {
    lines: {
      found: 0,
      hit: 0,
      details: [],
    },
    functions: {
      hit: 0,
      found: 0,
      details: [],
    },
    branches: {
      hit: 0,
      found: 0,
      details: [],
    },
  } as unknown as LcovFile;
}

export function parse(input: string): Lcov {
  const result = [] as Lcov;
  let item = emptyItem();

  for (let line of input.split('\n')) {
    line = line.trim();
    const allParts = line.split(':');

    const parts = [allParts.shift(), allParts.join(':')] as [string, string];
    let lines;
    let function_: string[];

    switch (parts[0].toUpperCase()) {
      case 'TN': {
        item.title = parts[1].trim();
        break;
      }
      case 'SF': {
        item.file = parts.slice(1).join(':').trim();
        break;
      }
      case 'FNF': {
        item.functions.found = Number(parts[1].trim());
        break;
      }
      case 'FNH': {
        item.functions.hit = Number(parts[1].trim());
        break;
      }
      case 'LF': {
        item.lines.found = Number(parts[1].trim());
        break;
      }
      case 'LH': {
        item.lines.hit = Number(parts[1].trim());
        break;
      }
      case 'DA': {
        lines = parts[1].split(',');
        item.lines.details.push({
          line: Number(lines[0]),
          hit: Number(lines[1]),
        });
        break;
      }
      case 'FN': {
        function_ = parts[1].split(',') as [string, string];
        item.functions.details.push({
          name: function_[1] as string,
          line: Number(function_[0]),
        });
        break;
      }
      case 'FNDA': {
        function_ = parts[1].split(',');
        // eslint-disable-next-line no-loop-func
        item.functions.details.some((lcovFunction, index) => {
          if (lcovFunction.name === function_[1] && lcovFunction.hit === undefined) {
            (item.functions.details[index] as LcovFunction).hit = Number(function_[0]);
            return true;
          }
          return false;
        });
        break;
      }
      case 'BRDA': {
        function_ = parts[1].split(',');
        item.branches.details.push({
          line: Number(function_[0]),
          block: Number(function_[1]),
          branch: Number(function_[2]),
          // eslint-disable-next-line no-magic-numbers
          taken: function_[3] === '-' ? 0 : Number(function_[3]),
        });
        break;
      }
      case 'BRF': {
        item.branches.found = Number(parts[1]);
        break;
      }
      case 'BRH': {
        item.branches.hit = Number(parts[1]);
        break;
      }
    }

    if (line.includes('end_of_record')) {
      result.push(item);
      item = emptyItem();
    }
  }

  if (result.length === 0) {
    throw new Error('Failed to parse string');
  }

  return result;
}

// Get the total coverage percentage from the lcov data.
export function percentage(lcov: { lines: LcovPart<LcovLine> }[]): number {
  let hit = 0;
  let found = 0;
  for (const entry of lcov) {
    hit += entry.lines.hit;
    found += entry.lines.found;
  }
  // eslint-disable-next-line no-magic-numbers
  return (hit / found) * 100;
}
