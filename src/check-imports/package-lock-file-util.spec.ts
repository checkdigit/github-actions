// check-imports/package-lock-file-util.spec.ts

// eslint-disable-next-line @checkdigit/no-util
import { strict as assert } from 'node:assert';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { describe, it } from 'node:test';

import examplePackageLock from './example-package-lock.json' with { type: 'json' };
import { extractPackageName, getPackageLock, satisfiesNameAndRange } from './package-lock-file-util.ts';

describe('package lock file utilities', async () => {
  it('can get a package-lock file', async () => {
    const workFolder = path.join(os.tmpdir(), crypto.randomUUID());
    await fs.mkdir(workFolder);

    await fs.writeFile(path.join(workFolder, 'package-lock.json'), JSON.stringify(examplePackageLock));
    const packageLock = await getPackageLock(workFolder);
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
