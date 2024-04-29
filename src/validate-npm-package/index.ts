// validate-npm-package/index.ts

import { getInput } from '@actions/core';

import main from './validate-npm-package';

await main(getInput('betaPackage'));
