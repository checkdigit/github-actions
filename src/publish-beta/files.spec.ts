// publish-beta/files.spec.ts

import { strict as assert } from 'node:assert';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { describe, it } from 'node:test';

import copyNonTSFiles, { removeTestFilesFromSource } from './files.ts';

describe('copy', async () => {
  it('test recursive filtering', async () => {
    const rootDirectory = path.join(os.tmpdir(), crypto.randomUUID());
    await fs.mkdir(rootDirectory);

    const sourceDirectory = path.join(rootDirectory, 'src');
    const destinationDirectory = path.join(rootDirectory, 'dist');
    await fs.mkdir(destinationDirectory);

    const sourceV1 = path.join(sourceDirectory, 'api', 'v1');
    const sourceV2 = path.join(sourceDirectory, 'api', 'v2');

    await fs.mkdir(sourceV1, { recursive: true });
    await fs.mkdir(sourceV2, { recursive: true });

    await fs.writeFile(path.join(sourceV1, 'test.ts'), 'test');
    await fs.writeFile(path.join(sourceV2, 'test2.ts'), 'test');
    await fs.writeFile(path.join(sourceV1, 'actiontestv1.yml'), 'actiontestv1.yml');
    await fs.writeFile(path.join(sourceV2, 'actiontestv2.yml'), 'actiontestv2.yml');
    await fs.writeFile(path.join(sourceDirectory, 'testfile.json'), 'testfile.json');
    await copyNonTSFiles(sourceDirectory, destinationDirectory);

    const file1 = await fs.readFile(path.join(destinationDirectory, 'testfile.json'), 'utf8');
    assert.equal(file1, 'testfile.json');
    const file2 = await fs.readFile(path.join(destinationDirectory, 'api/v1/actiontestv1.yml'), 'utf8');
    assert.equal(file2, 'actiontestv1.yml');
    const file3 = await fs.readFile(path.join(destinationDirectory, 'api/v2/actiontestv2.yml'), 'utf8');
    assert.equal(file3, 'actiontestv2.yml');

    // eslint-disable-next-line @checkdigit/require-assert-predicate-rejects-throws
    await assert.rejects(fs.readFile(path.join(destinationDirectory, 'api/v1/test.ts'), 'utf8'));
    // eslint-disable-next-line @checkdigit/require-assert-predicate-rejects-throws
    await assert.rejects(fs.readFile(path.join(destinationDirectory, 'api/v2/test2.ts'), 'utf8'));
  });

  it('test removal of all files except .ts (excluding .spec.ts and .test.ts)', async () => {
    const sourceDirectory = path.join(os.tmpdir(), crypto.randomUUID(), 'src');
    await fs.mkdir(sourceDirectory, { recursive: true });
    await Promise.all([
      fs.writeFile(path.join(sourceDirectory, 'test.ts'), 'test'),
      fs.writeFile(path.join(sourceDirectory, 'test.spec.ts'), 'test'),
      fs.writeFile(path.join(sourceDirectory, 'test.spec.mts'), 'testmjs'),
      fs.writeFile(path.join(sourceDirectory, 'favorite.test.mts'), 'testmjs'),
      fs.writeFile(path.join(sourceDirectory, 'swagger.yml'), 'test'),
    ]);
    await removeTestFilesFromSource(sourceDirectory);

    const files = await fs.readdir(sourceDirectory, { withFileTypes: true });
    assert.equal(files.length, 2);
    assert.ok(files.some((item) => item.name === 'test.ts'));
    assert.ok(files.some((item) => item.name === 'swagger.yml'));
  });
});
