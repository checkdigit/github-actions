// publish-beta/publish.spec.ts

import { strict as assert } from 'node:assert';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';

import { describe, it } from '@jest/globals';
import { v4 as uuid } from 'uuid';

import { addNPMRCFile } from './publish';

describe('package', () => {
  it('Test generation of .npmrc file in empty directory', async () => {
    const rootdirectory = path.join(os.tmpdir(), uuid());
    await fs.mkdir(rootdirectory);
    await addNPMRCFile(rootdirectory);

    const npmrcFile = await fs.readFile(path.join(rootdirectory, '.npmrc'), 'utf8');
    // eslint-disable-next-line no-template-curly-in-string
    assert.equal(npmrcFile, '//registry.npmjs.org/:_authToken=${NPM_TOKEN}');
  });

  it('Test existing .npmrc file is left in place if it exists', async () => {
    const rootdirectory = path.join(os.tmpdir(), uuid());
    await fs.mkdir(rootdirectory);
    await fs.writeFile(path.join(rootdirectory, '.npmrc'), 'test', 'utf8');
    await addNPMRCFile(rootdirectory);

    const npmrcFile = await fs.readFile(path.join(rootdirectory, '.npmrc'), 'utf8');
    assert.equal(npmrcFile, 'test');
  });
});
