// package-denier/package-lock-file-util.spec.ts

import { strict as assert } from 'node:assert';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';

import example from './example-package-lock.json';
import { getPackageLock, getPackageNameFromKey, isInList } from './package-lock-file-util';

describe('package', () => {
  beforeAll(async () => {
    await mkdir(path.join(tmpdir(), 'packageDeny'), { recursive: true });
    await mkdir(path.join(tmpdir(), 'packageDeny2'), { recursive: true });
    await mkdir(path.join(tmpdir(), 'hasAPI', 'src/api'), { recursive: true });
    await mkdir(path.join(tmpdir(), 'noAPI', 'src/'), { recursive: true });
  });

  afterAll(async () => {
    await rm(path.join(tmpdir(), 'packageDeny'), { recursive: true });
    await rm(path.join(tmpdir(), 'packageDeny2'), { recursive: true });
    await rm(path.join(tmpdir(), 'hasAPI'), { recursive: true });
    await rm(path.join(tmpdir(), 'noAPI'), { recursive: true });
  });

  it('can gets a package-lock file', async () => {
    await writeFile(path.join(tmpdir(), 'packageDeny/package-lock.json'), JSON.stringify(example));
    await mkdir(path.join(tmpdir(), 'packageDeny/src'), { recursive: true });

    const packageLock = await getPackageLock(path.join(tmpdir(), 'packageDeny'));
    assert.ok(packageLock.name === '@checkdigit/github-actions');
  });

  it('can get the package name from a package-lock relative path', () => {
    const list = [
      'node_modules/@aws-sdk/client-sts',
      'node_modules/@aws-sdk/client-cloudformation/node_modules/fast-xml-parser',
    ];

    const names = list.map((item) => getPackageNameFromKey(item));

    assert.deepEqual(names, ['@aws-sdk/client-sts', 'fast-xml-parser']);
  });

  it('can check if a package name and version is in a list', () => {
    // matching package name different versions
    assert.equal(isInList('@aws-sdk/client-sts', '3.2.0', [['@aws-sdk/client-sts', '>', '3.1.0']]), true);
    assert.equal(isInList('@aws-sdk/client-sts', '3.1.0', [['@aws-sdk/client-sts', '>', '3.1.0']]), false);

    assert.equal(isInList('@aws-sdk/client-sts', '4.0.0', [['@aws-sdk/client-sts', '>=', '3.1.0']]), true);
    assert.equal(isInList('@aws-sdk/client-sts', '3.1.0', [['@aws-sdk/client-sts', '>=', '3.1.0']]), true);
    assert.equal(isInList('@aws-sdk/client-sts', '2.1.0', [['@aws-sdk/client-sts', '>=', '3.1.0']]), false);

    assert.equal(isInList('@aws-sdk/client-sts', '3.1.0', [['@aws-sdk/client-sts', '=', '3.1.0']]), true);
    assert.equal(isInList('@aws-sdk/client-sts', '3.0.0', [['@aws-sdk/client-sts', '=', '3.1.0']]), false);

    assert.equal(isInList('@aws-sdk/client-sts', '3.1.0', [['@aws-sdk/client-sts', '<=', '3.1.0']]), true);
    assert.equal(isInList('@aws-sdk/client-sts', '3.0.0', [['@aws-sdk/client-sts', '<=', '3.1.0']]), true);
    assert.equal(isInList('@aws-sdk/client-sts', '3.2.0', [['@aws-sdk/client-sts', '<=', '3.1.0']]), false);

    assert.equal(isInList('@aws-sdk/client-sts', '3.2.0', [['@aws-sdk/client-sts', '>', '3.1.0']]), true);
    assert.equal(isInList('@aws-sdk/client-sts', '3.1.0', [['@aws-sdk/client-sts', '>', '3.1.0']]), false);

    // star notion for listed package
    assert.equal(isInList('@aws-sdk/client-sts', '3.2.0', [['@aws-sdk/client-*', '>', '3.1.0']]), true);
    assert.equal(isInList('@aws-sdk/client-sts', '3.1.0', [['@aws-sdk/client-*', '>', '3.1.0']]), false);
    assert.equal(isInList('@aws-sdk', '3.2.0', [['@aws-sdk/client-*', '>', '3.1.0']]), false);

    // star notion for incoming package
    assert.equal(isInList('@aws-sdk/client-*', '3.2.0', [['@aws-sdk/client-sts', '>', '3.1.0']]), true);
    assert.equal(isInList('@aws-sdk/client-*', '3.1.0', [['@aws-sdk/client-sts', '>', '3.1.0']]), false);
    assert.equal(isInList('@aws-sdk/client-*', '3.2.0', [['@aws-sdk', '>', '3.1.0']]), false);

    // star notion for both
    assert.equal(isInList('@aws-sdk/client-*', '3.2.0', [['@aws-sdk/client-*', '>', '3.1.0']]), true);
    assert.equal(isInList('@aws-sdk/client-*', '3.1.0', [['@aws-sdk/client-*', '>', '3.1.0']]), false);
  });
});
