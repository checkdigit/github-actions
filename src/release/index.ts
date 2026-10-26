// release/index.ts

import { setFailed } from '@actions/core';

import main from './release.ts';

try {
  await main();
} catch (error) {
  setFailed(error instanceof Error ? error.message : String(error));
}
