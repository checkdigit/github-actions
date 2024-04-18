// publish-beta/package.spec.ts

import { strict as assert } from 'node:assert';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';

import { describe, it } from '@jest/globals';
import { v4 as uuid } from 'uuid';

import { generatePackageBetaTag, packageJSONUpdate } from './package';

describe('package', () => {
  it('generatePackageBetaTag', async () => {
    process.env['GITHUB_REF'] = '/ref/2406/branch';
    process.env['GITHUB_SHA'] = '1234';
    const packageBetaTag = generatePackageBetaTag();
    assert.ok(packageBetaTag.startsWith('PR.2406-'));
  });

  it('test packageJSON Update and add /src/ to files', async () => {
    const workFolder = path.join(tmpdir(), uuid());
    await mkdir(workFolder);

    const filePath = path.join(workFolder, 'package.json');
    process.env['GITHUB_REF'] = '/ref/87/branch';
    process.env['GITHUB_SHA'] = '12345678ad90';
    await writeFile(filePath, JSON.stringify({ name: 'testpackage', version: '1.2.10', files: ['/dist/'] }));
    await mkdir(path.join(workFolder, 'src'));

    await packageJSONUpdate(workFolder);
    const rawUpdatedFile = await readFile(filePath, 'utf8');
    assert.ok(JSON.parse(rawUpdatedFile).version === '1.2.10-PR.87-ad90');
    assert.deepEqual(JSON.parse(rawUpdatedFile).files.sort(), ['/dist/'].sort());
  });

  it('Test with files property missing', async () => {
    const workFolder = path.join(tmpdir(), uuid());
    await mkdir(workFolder);

    process.env['GITHUB_REF'] = '/ref/87/branch';
    await writeFile(path.join(workFolder, 'package.json'), JSON.stringify({ name: 'testpackage', version: '1.2.10' }));
    await assert.rejects(packageJSONUpdate(workFolder), '[Error: package.json does not have a files: [] property]');
  });
});
