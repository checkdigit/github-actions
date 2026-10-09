// check-dependency-maintenance/index.ts

import { setFailed } from '@actions/core';

import check from './check-dependency-maintenance.ts';

try {
  await check();
} catch (error) {
  setFailed(error instanceof Error ? error.message : String(error));
}
