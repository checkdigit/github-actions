// prepare-beta/package.spec.ts

import { strict as assert } from 'node:assert';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { describe, it } from 'node:test';

import { generatePackageBetaTag, packageJSONUpdate } from './package.ts';

describe('package', async () => {
  it('generatePackageBetaTag', async () => {
    process.env['GITHUB_REF'] = '/ref/2406/branch';
    process.env['GITHUB_SHA'] = '1234';
    const packageBetaTag = generatePackageBetaTag();
    assert.ok(packageBetaTag.startsWith('PR.2406-'));
  });

  it('test packageJSON Update and add /src/ to files', async () => {
    const workFolder = path.join(os.tmpdir(), crypto.randomUUID());
    await fs.mkdir(workFolder);

    const filePath = path.join(workFolder, 'package.json');
    process.env['GITHUB_REF'] = '/ref/87/branch';
    process.env['GITHUB_SHA'] = '12345678ad90';
    await fs.writeFile(filePath, JSON.stringify({ name: 'testpackage', version: '1.2.10', files: ['/dist/'] }));
    await fs.mkdir(path.join(workFolder, 'src'));

    await packageJSONUpdate(workFolder);
    const rawUpdatedFile = await fs.readFile(filePath, 'utf8');
    assert.ok(JSON.parse(rawUpdatedFile).version === '1.2.10-PR.87-ad90');
    assert.deepEqual(JSON.parse(rawUpdatedFile).files, ['/dist/']);
  });
});
