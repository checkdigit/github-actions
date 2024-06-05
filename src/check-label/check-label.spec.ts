// check-label/check-label.spec.ts

import { strict as assert } from 'node:assert';
import path from 'node:path';
import os from 'node:os';
import { promises as fs } from 'node:fs';

import { describe, it } from '@jest/globals';
import { v4 as uuid } from 'uuid';

import gitHubNock, {
  createGithubEventFile,
  PR_NUMBER_MAJOR,
  PR_NUMBER_MINOR,
  PR_NUMBER_PATCH,
} from '../nocks/github.test';
import checkLabel from './check-label';

async function createContext(prNumber: number) {
  process.env['GITHUB_REPOSITORY'] = 'checkdigit/testlabel';
  process.env['GITHUB_EVENT_PATH'] = await createGithubEventFile(prNumber);
}

describe('check label', () => {
  it('Test with no labels throws correctly', async () => {
    // assert that the call to checkLabel rejects a promise
    await assert.rejects(checkLabel());
  });

  it.each([
    { mainVersion: '1.0.0', currentVersion: '1.0.0', prNumber: PR_NUMBER_PATCH, success: false },
    { mainVersion: '1.0.0', currentVersion: '1.0.1', prNumber: PR_NUMBER_PATCH, success: true },
    { mainVersion: '1.0.0', currentVersion: '1.1.0', prNumber: PR_NUMBER_PATCH, success: false },
    { mainVersion: '1.0.0', currentVersion: '2.0.0', prNumber: PR_NUMBER_PATCH, success: false },
    { mainVersion: '1.1.0', currentVersion: '1.1.0', prNumber: PR_NUMBER_MINOR, success: false },
    { mainVersion: '1.1.0', currentVersion: '1.1.1', prNumber: PR_NUMBER_MINOR, success: false },
    { mainVersion: '1.1.1', currentVersion: '1.2.0', prNumber: PR_NUMBER_MINOR, success: true },
    { mainVersion: '1.1.1', currentVersion: '1.2.1', prNumber: PR_NUMBER_MINOR, success: false },
    { mainVersion: '1.1.1', currentVersion: '2.0.0', prNumber: PR_NUMBER_MINOR, success: false },
    { mainVersion: '2.2.2', currentVersion: '2.2.2', prNumber: PR_NUMBER_MAJOR, success: false },
    { mainVersion: '2.2.2', currentVersion: '2.2.3', prNumber: PR_NUMBER_MAJOR, success: false },
    { mainVersion: '2.2.2', currentVersion: '2.3.0', prNumber: PR_NUMBER_MAJOR, success: false },
    { mainVersion: '2.2.2', currentVersion: '3.0.0', prNumber: PR_NUMBER_MAJOR, success: true },
    { mainVersion: '2.2.2', currentVersion: '3.0.2', prNumber: PR_NUMBER_MAJOR, success: false },
    { mainVersion: '2.2.2', currentVersion: '3.2.2', prNumber: PR_NUMBER_MAJOR, success: false },
  ])(
    'pull request: $prNumber; version in main branch: $mainVersion; version in PR branch: $currentVersion; success: $success',
    async ({ mainVersion, currentVersion, prNumber, success }) => {
      process.env['GITHUB_TOKEN'] = 'token 0000000000000000000000000000000000000001';

      gitHubNock({ labelPackageVersionMain: mainVersion });

      const workFolder = path.join(os.tmpdir(), uuid());
      await fs.mkdir(workFolder);
      await fs.writeFile(path.join(workFolder, 'package.json'), JSON.stringify({ version: currentVersion }));
      await fs.writeFile(path.join(workFolder, 'package-lock.json'), JSON.stringify({ version: currentVersion }));

      const originalCwd = process.cwd();
      try {
        process.chdir(workFolder);
        await createContext(prNumber);
        if (success) {
          await assert.doesNotReject(checkLabel());
        } else {
          await assert.rejects(checkLabel());
        }
      } finally {
        process.chdir(originalCwd);
      }
    },
  );
});
