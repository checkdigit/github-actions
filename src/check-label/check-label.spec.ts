// check-label/check-label.spec.ts

import { strict as assert } from 'node:assert';
import process from 'node:process';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { v4 as uuid } from 'uuid';

import gitHubNock from '../nocks/github.test';
import checkLabel from './check-label';

async function createContext(prNumber: number) {
  process.env['GITHUB_REPOSITORY'] = 'checkdigit/testlabel';
  const filePath = path.join(tmpdir(), 'actioncontexttestlabel', uuid());
  await writeFile(
    filePath,
    JSON.stringify({
      // eslint-disable-next-line camelcase
      pull_request: {
        number: prNumber,
      },
    })
  );
  process.env['GITHUB_EVENT_PATH'] = filePath;
}

function semverSubtract(version: string, versionLabel: 'patch' | 'major' | 'minor'): string {
  const versionParts = version.split('.');
  if (versionLabel === 'major' && Number(versionParts[1]) !== 0) {
    versionParts[0] = (Number(versionParts[0]) - 1).toString();
  }

  if (versionLabel === 'minor' && Number(versionParts[1]) !== 0) {
    versionParts[1] = (Number(versionParts[1]) - 1).toString();
  }

  if (versionLabel === 'patch' && Number(versionParts[2]) !== 0) {
    versionParts[2] = (Number(versionParts[2]) - 1).toString();
  }

  return versionParts.join('.');
}

describe('check label', () => {
  beforeAll(async () => mkdir(path.join(tmpdir(), 'actioncontexttestlabel')));
  afterAll(async () => rm(path.join(tmpdir(), 'actioncontexttestlabel'), { recursive: true }));

  it('Test with no labels throws correctly', async () => {
    // assert that the call to checkLabel rejects a promise
    await assert.rejects(checkLabel());
  });

  it('label matches - patch', async () => {
    process.env['GITHUB_TOKEN'] = 'token 0000000000000000000000000000000000000001';

    const packageJsonRaw = await readFile(path.join(process.cwd(), 'package.json'), 'utf8');
    const packageJson = JSON.parse(packageJsonRaw);

    const targetVersion = semverSubtract(packageJson.version, 'patch');
    assert(targetVersion !== null);
    gitHubNock({ labelPackageVersionMain: targetVersion });

    await createContext(10);
    // assert that the call to checkLabel rejects a promise
    await assert.doesNotReject(checkLabel());
  });

  it('label does not match - should be major but is patch', async () => {
    process.env['GITHUB_TOKEN'] = 'token 0000000000000000000000000000000000000001';

    const packageJsonRaw = await readFile(path.join(process.cwd(), 'package.json'), 'utf8');
    const packageJson = JSON.parse(packageJsonRaw);

    const targetVersion = semverSubtract(packageJson.version, 'patch');
    assert(targetVersion !== null);
    gitHubNock({ labelPackageVersionMain: targetVersion });

    await createContext(11);
    // assert that the call to checkLabel rejects a promise

    await assert.rejects(checkLabel(), {
      message: 'Version is incorrect based on Pull Request label',
    });
  });
});
