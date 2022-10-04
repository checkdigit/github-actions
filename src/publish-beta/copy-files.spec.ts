// publish-beta/copy-files.spec.ts

import { strict as assert } from 'node:assert';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';

import { v4 as uuid } from 'uuid';
import copyNonTSFiles from './copy-files';

describe('copy', () => {
  beforeAll(async () => {
    await mkdir(path.join(tmpdir(), 'testcopy'), { recursive: true });
  });

  afterAll(async () => {
    await rm(path.join(tmpdir(), 'testcopy'), { recursive: true });
  });

  it('test recursive filtering', async () => {
    const rootDirectory = path.join(tmpdir(), 'testcopy', uuid());
    await mkdir(rootDirectory);

    const sourceDirectory = path.join(rootDirectory, 'src');
    const destinationDirectory = path.join(rootDirectory, 'dist');
    await mkdir(destinationDirectory);

    const sourceV1 = path.join(sourceDirectory, 'api', 'v1');
    const sourceV2 = path.join(sourceDirectory, 'api', 'v2');

    await mkdir(sourceV1, { recursive: true });
    await mkdir(sourceV2, { recursive: true });

    await writeFile(path.join(sourceV1, 'test.ts'), 'test');
    await writeFile(path.join(sourceV2, 'test2.ts'), 'test');
    await writeFile(path.join(sourceV1, 'actiontestv1.yml'), 'actiontestv1.yml');
    await writeFile(path.join(sourceV2, 'actiontestv2.yml'), 'actiontestv2.yml');
    await writeFile(path.join(sourceDirectory, 'testfile.json'), 'testfile.json');
    await copyNonTSFiles(sourceDirectory, destinationDirectory);

    const file1 = await readFile(path.join(destinationDirectory, 'testfile.json'), 'utf8');
    assert.equal(file1, 'testfile.json');
    const file2 = await readFile(path.join(destinationDirectory, 'api/v1/actiontestv1.yml'), 'utf8');
    assert.equal(file2, 'actiontestv1.yml');
    const file3 = await readFile(path.join(destinationDirectory, 'api/v2/actiontestv2.yml'), 'utf8');
    assert.equal(file3, 'actiontestv2.yml');

    await assert.rejects(readFile(path.join(destinationDirectory, 'api/v1/test.ts'), 'utf8'));
    await assert.rejects(readFile(path.join(destinationDirectory, 'api/v2/test2.ts'), 'utf8'));
  });
});
