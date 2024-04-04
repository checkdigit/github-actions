// publish-beta/package.spec.ts

import { strict as assert } from 'node:assert';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';

import { afterAll, beforeAll, describe, it } from '@jest/globals';

import { generatePackageBetaTag, packageJSONUpdate } from './package';

describe('package', () => {
  beforeAll(async () => {
    await mkdir(path.join(tmpdir(), 'packageUpdate'), { recursive: true });
    await mkdir(path.join(tmpdir(), 'packageUpdate2'), { recursive: true });
    await mkdir(path.join(tmpdir(), 'hasAPI', 'src/api'), { recursive: true });
    await mkdir(path.join(tmpdir(), 'noAPI', 'src/'), { recursive: true });
  });

  afterAll(async () => {
    await rm(path.join(tmpdir(), 'packageUpdate'), { recursive: true });
    await rm(path.join(tmpdir(), 'packageUpdate2'), { recursive: true });
    await rm(path.join(tmpdir(), 'hasAPI'), { recursive: true });
    await rm(path.join(tmpdir(), 'noAPI'), { recursive: true });
  });

  it('generatePackageBetaTag', async () => {
    process.env['GITHUB_REF'] = '/ref/2406/branch';
    process.env['GITHUB_SHA'] = '1234';
    const packageBetaTag = generatePackageBetaTag();
    assert.ok(packageBetaTag.startsWith('PR.2406-'));
  });

  it('test packageJSON Update and add /src/ to files', async () => {
    const filePath = path.join(tmpdir(), 'packageUpdate/package.json');
    process.env['GITHUB_REF'] = '/ref/87/branch';
    process.env['GITHUB_SHA'] = '12345678ad90';
    await writeFile(
      path.join(tmpdir(), 'packageUpdate/package.json'),
      JSON.stringify({ name: 'testpackage', version: '1.2.10', files: ['/dist/'] }),
    );
    await mkdir(path.join(tmpdir(), 'packageUpdate/src'), { recursive: true });

    await packageJSONUpdate(path.join(tmpdir(), 'packageUpdate'));
    const rawUpdatedFile = await readFile(filePath, 'utf8');
    assert.ok(JSON.parse(rawUpdatedFile).version === '1.2.10-PR.87-ad90');
    assert.deepEqual(JSON.parse(rawUpdatedFile).files.sort(), ['/dist/'].sort());
  });

  it('Test with files property missing', async () => {
    process.env['GITHUB_REF'] = '/ref/87/branch';
    await writeFile(
      path.join(tmpdir(), 'packageUpdate2/package.json'),
      JSON.stringify({ name: 'testpackage', version: '1.2.10' }),
    );
    await assert.rejects(
      packageJSONUpdate(path.join(tmpdir(), 'packageUpdate2')),
      '[Error: package.json does not have a files: [] property]',
    );
  });
});
