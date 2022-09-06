// package.spec.ts

import { strict as assert } from 'node:assert';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import process from 'node:process';

import { generatePackageBetaTag, isPackageAnAPI, packageJSONUpdate } from './package';

describe('package', () => {
  beforeAll(async () => {
    await mkdir(path.join(tmpdir(), 'packageUpdate'), { recursive: true });
    await mkdir(path.join(tmpdir(), 'hasAPI', 'src/api'), { recursive: true });
    await mkdir(path.join(tmpdir(), 'noAPI', 'src/'), { recursive: true });
  });

  afterAll(async () => {
    await rm(path.join(tmpdir(), 'packageUpdate'), { recursive: true });
    await rm(path.join(tmpdir(), 'hasAPI'), { recursive: true });
    await rm(path.join(tmpdir(), 'noAPI'), { recursive: true });
  });

  it('generatePackageBetaTag', async () => {
    process.env['GITHUB_REF'] = '/ref/2406/branch';
    const packageBetaTag = generatePackageBetaTag();
    assert.ok(packageBetaTag.startsWith('2406-'));
  });

  it('hasAPI', async () => {
    assert.equal(await isPackageAnAPI(path.join(tmpdir(), 'hasAPI')), true);
  });
  it('noAPI', async () => {
    assert.equal(await isPackageAnAPI(path.join(tmpdir(), 'noAPI')), false);
  });

  it('packageJSONUpdate', async () => {
    const filePath = path.join(tmpdir(), 'packageUpdate/package.json');
    process.env['GITHUB_REF'] = '/ref/87/branch';
    await writeFile(
      path.join(tmpdir(), 'packageUpdate/package.json'),
      JSON.stringify({ name: 'testpackage', version: '1.2.10' })
    );
    await packageJSONUpdate(path.join(tmpdir(), 'packageUpdate'));
    const rawUpdatedFile = await readFile(filePath, 'utf8');
    assert.ok(JSON.parse(rawUpdatedFile).version.startsWith('1.2.10-beta.87-'));
  });
});
