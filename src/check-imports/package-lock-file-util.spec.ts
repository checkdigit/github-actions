// check-imports/package-lock-file-util.spec.ts

import { strict as assert } from 'node:assert';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';

import examplePackageLock from './example-package-lock.json' assert { type: 'json' };
import { extractPackageName, getPackageLock, satisfiesNameAndRange } from './package-lock-file-util';

describe('package lock file utilities', () => {
  beforeAll(async () => {
    await mkdir(path.join(tmpdir(), 'temporaryDirectory'), { recursive: true });
  });

  afterAll(async () => {
    await rm(path.join(tmpdir(), 'temporaryDirectory'), { recursive: true });
  });

  it('can get a package-lock file', async () => {
    await writeFile(path.join(tmpdir(), 'temporaryDirectory/package-lock.json'), JSON.stringify(examplePackageLock));
    const packageLock = await getPackageLock(path.join(tmpdir(), 'temporaryDirectory'));
    assert.ok(packageLock.name === '@checkdigit/github-actions');
  });

  it('can get the package name from a package-lock packages key', () => {
    const packageLockKeys = [
      'node_modules/@aws-sdk/client-sts',
      'node_modules/@aws-sdk/client-cloudformation/node_modules/fast-xml-parser',
    ];
    const names = packageLockKeys.map((key) => extractPackageName(key));
    assert.deepEqual(names, ['@aws-sdk/client-sts', 'fast-xml-parser']);
  });

  it('can check if a package name and version matches name and range', () => {
    // matching package name different versions
    assert.equal(satisfiesNameAndRange('@aws-sdk/client-sts', '3.2.0', ['@aws-sdk/client-sts', '>3.1.0']), true);
    assert.equal(satisfiesNameAndRange('@aws-sdk/client-sts', '3.1.0', ['@aws-sdk/client-sts', '>3.1.0']), false);

    assert.equal(satisfiesNameAndRange('@aws-sdk/client-sts', '4.0.0', ['@aws-sdk/client-sts', '>=3.1.0']), true);
    assert.equal(satisfiesNameAndRange('@aws-sdk/client-sts', '3.1.0', ['@aws-sdk/client-sts', '>=3.1.0']), true);
    assert.equal(satisfiesNameAndRange('@aws-sdk/client-sts', '2.1.0', ['@aws-sdk/client-sts', '>=3.1.0']), false);
    assert.equal(satisfiesNameAndRange('@aws-sdk/client-sts', '3.1.0', ['@aws-sdk/client-sts', '=3.1.0']), true);
    assert.equal(satisfiesNameAndRange('@aws-sdk/client-sts', '3.0.0', ['@aws-sdk/client-sts', '=3.1.0']), false);

    assert.equal(satisfiesNameAndRange('@aws-sdk/client-sts', '3.1.0', ['@aws-sdk/client-sts', '<=3.1.0']), true);
    assert.equal(satisfiesNameAndRange('@aws-sdk/client-sts', '3.0.0', ['@aws-sdk/client-sts', '<=3.1.0']), true);
    assert.equal(satisfiesNameAndRange('@aws-sdk/client-sts', '3.2.0', ['@aws-sdk/client-sts', '<=3.1.0']), false);

    assert.equal(satisfiesNameAndRange('@aws-sdk/client-sts', '3.2.0', ['@aws-sdk/client-sts', '>3.1.0']), true);
    assert.equal(satisfiesNameAndRange('@aws-sdk/client-sts', '3.1.0', ['@aws-sdk/client-sts', '>3.1.0']), false);

    // star notion for listed package
    assert.equal(satisfiesNameAndRange('@aws-sdk/client-sts', '3.2.0', ['@aws-sdk/client-*', '>3.1.0']), true);
    assert.equal(satisfiesNameAndRange('@aws-sdk/client-sts', '3.1.0', ['@aws-sdk/client-*', '>3.1.0']), false);
    assert.equal(satisfiesNameAndRange('@aws-sdk', '3.2.0', ['@aws-sdk/client-*', '>3.1.0']), false);

    // star notion for incoming package
    assert.equal(satisfiesNameAndRange('@aws-sdk/client-*', '3.2.0', ['@aws-sdk/client-sts', '>3.1.0']), true);
    assert.equal(satisfiesNameAndRange('@aws-sdk/client-*', '3.1.0', ['@aws-sdk/client-sts', '>3.1.0']), false);
    assert.equal(satisfiesNameAndRange('@aws-sdk/client-*', '3.2.0', ['@aws-sdk', '>3.1.0']), false);

    // star notion for both
    assert.equal(satisfiesNameAndRange('@aws-sdk/client-*', '3.2.0', ['@aws-sdk/client-*', '>3.1.0']), true);
    assert.equal(satisfiesNameAndRange('@aws-sdk/client-*', '3.1.0', ['@aws-sdk/client-*', '>3.1.0']), false);
  });
});
