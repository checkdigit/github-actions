// publish-beta/publish.spec.ts

import { strict as assert } from 'node:assert';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';

import { afterAll, beforeAll, describe, it } from '@jest/globals';
import { v4 as uuid } from 'uuid';

import { addNPMRCFile } from './publish';

describe('package', () => {
  beforeAll(async () => {
    await mkdir(path.join(tmpdir(), 'publishtest'), { recursive: true });
  });

  afterAll(async () => {
    await rm(path.join(tmpdir(), 'publishtest'), { recursive: true });
  });

  it('Test generation of .npmrc file in empty directory', async () => {
    const rootdirectory = path.join(tmpdir(), 'publishtest', uuid());
    await mkdir(rootdirectory);
    await addNPMRCFile(rootdirectory);

    const npmrcFile = await readFile(path.join(rootdirectory, '.npmrc'), 'utf8');
    // eslint-disable-next-line no-template-curly-in-string
    assert.equal(npmrcFile, '//registry.npmjs.org/:_authToken=${NPM_TOKEN}');
  });

  it('Test existing .npmrc file is left in place if it exists', async () => {
    const rootdirectory = path.join(tmpdir(), 'publishtest', uuid());
    await mkdir(rootdirectory);
    await writeFile(path.join(rootdirectory, '.npmrc'), 'test', 'utf8');
    await addNPMRCFile(rootdirectory);

    const npmrcFile = await readFile(path.join(rootdirectory, '.npmrc'), 'utf8');
    assert.equal(npmrcFile, 'test');
  });
});
