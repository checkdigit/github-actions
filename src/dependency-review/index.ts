// dependency-review/index.ts

import { setFailed } from '@actions/core';

import main from './dependency-review.ts';

try {
  await main();
} catch (error) {
  setFailed(error instanceof Error ? error.message : String(error));
}
