// check-label/check-label.spec.ts

import { strict as assert } from 'node:assert';
import path from 'node:path';
import os from 'node:os';
import { promises as fs } from 'node:fs';
import { describe, it } from 'node:test';

import gitHubNock, {
  createGithubEventFile,
  PR_NUMBER_MAJOR,
  PR_NUMBER_MINOR,
  PR_NUMBER_PATCH,
} from '../nocks/github.test.ts';
import checkLabel from './check-label.ts';

async function createContext(prNumber: number) {
  process.env['GITHUB_REPOSITORY'] = 'checkdigit/testlabel';
  process.env['GITHUB_EVENT_PATH'] = await createGithubEventFile(prNumber);
}

describe('check label', async () => {
  it('Test with no labels throws correctly', async () => {
    // assert that the call to checkLabel rejects a promise
    // eslint-disable-next-line @checkdigit/require-assert-predicate-rejects-throws
    await assert.rejects(checkLabel());
  });

  [
    {
      mainVersion: '1.0.0',
      currentVersion: '1.0.0',
      prNumber: PR_NUMBER_PATCH,
      success: false,
    },
    {
      mainVersion: '1.0.0',
      currentVersion: '1.0.1',
      prNumber: PR_NUMBER_PATCH,
      success: true,
    },
    {
      mainVersion: '1.0.0',
      currentVersion: '1.1.0',
      prNumber: PR_NUMBER_PATCH,
      success: false,
    },
    {
      mainVersion: '1.0.0',
      currentVersion: '2.0.0',
      prNumber: PR_NUMBER_PATCH,
      success: false,
    },
    {
      mainVersion: '1.1.0',
      currentVersion: '1.1.0',
      prNumber: PR_NUMBER_MINOR,
      success: false,
    },
    {
      mainVersion: '1.1.0',
      currentVersion: '1.1.1',
      prNumber: PR_NUMBER_MINOR,
      success: false,
    },
    {
      mainVersion: '1.1.1',
      currentVersion: '1.2.0',
      prNumber: PR_NUMBER_MINOR,
      success: true,
    },
    {
      mainVersion: '1.1.1',
      currentVersion: '1.2.1',
      prNumber: PR_NUMBER_MINOR,
      success: false,
    },
    {
      mainVersion: '1.1.1',
      currentVersion: '2.0.0',
      prNumber: PR_NUMBER_MINOR,
      success: false,
    },
    {
      mainVersion: '2.2.2',
      currentVersion: '2.2.2',
      prNumber: PR_NUMBER_MAJOR,
      success: false,
    },
    {
      mainVersion: '2.2.2',
      currentVersion: '2.2.3',
      prNumber: PR_NUMBER_MAJOR,
      success: false,
    },
    {
      mainVersion: '2.2.2',
      currentVersion: '2.3.0',
      prNumber: PR_NUMBER_MAJOR,
      success: false,
    },
    {
      mainVersion: '2.2.2',
      currentVersion: '3.0.0',
      prNumber: PR_NUMBER_MAJOR,
      success: true,
    },
    {
      mainVersion: '2.2.2',
      currentVersion: '3.0.2',
      prNumber: PR_NUMBER_MAJOR,
      success: false,
    },
    {
      mainVersion: '2.2.2',
      currentVersion: '3.2.2',
      prNumber: PR_NUMBER_MAJOR,
      success: false,
    },
  ].forEach(({ mainVersion, currentVersion, prNumber, success }) => {
    it('pull request: $prNumber; version in main branch: $mainVersion; version in PR branch: $currentVersion; success: $success', async () => {
      process.env['GITHUB_TOKEN'] =
        'token 0000000000000000000000000000000000000001';

      gitHubNock({ labelPackageVersionMain: mainVersion });

      const workFolder = path.join(os.tmpdir(), crypto.randomUUID());
      await fs.mkdir(workFolder);
      await fs.writeFile(
        path.join(workFolder, 'package.json'),
        JSON.stringify({ version: currentVersion }),
      );
      await fs.writeFile(
        path.join(workFolder, 'package-lock.json'),
        JSON.stringify({ version: currentVersion }),
      );

      const originalCwd = process.cwd();
      try {
        process.chdir(workFolder);
        await createContext(prNumber);
        if (success) {
          await assert.doesNotReject(checkLabel());
        } else {
          // eslint-disable-next-line @checkdigit/require-assert-predicate-rejects-throws
          await assert.rejects(checkLabel());
        }
      } finally {
        process.chdir(originalCwd);
      }
    });
  });

  it('checks every Swagger endpoint configured by the branch package', async () => {
    process.env['GITHUB_TOKEN'] =
      'token 0000000000000000000000000000000000000001';

    const unchangedSwagger = `openapi: 3.0.0
info:
  version: 1.0.0
paths: {}
`;
    const changedMainSwagger = `swagger: '2.0'
info:
  version: 2.3.4
paths: {}
`;
    const changedBranchSwagger = changedMainSwagger.replace(
      'version: 2.3.4',
      'version: 2.3.5',
    );
    gitHubNock({
      labelPackageVersionMain: '1.0.0',
      missingSwaggerFiles: ['src/new/v99/swagger.yml'],
      swaggerFiles: {
        'src/api/v1/swagger.yml': unchangedSwagger,
        'src/admin/v2/swagger.yml': changedMainSwagger,
      },
    });

    const workFolder = path.join(os.tmpdir(), crypto.randomUUID());
    await fs.mkdir(path.join(workFolder, 'src/api/v1'), { recursive: true });
    await fs.mkdir(path.join(workFolder, 'src/admin/v2'), { recursive: true });
    await fs.mkdir(path.join(workFolder, 'src/new/v99'), { recursive: true });
    await fs.writeFile(
      path.join(workFolder, 'package.json'),
      JSON.stringify({
        version: '1.0.1',
        service: {
          api: {
            root: 'src',
            endpoints: ['api/v1', 'admin/v2', 'new/v99'],
          },
        },
      }),
    );
    await fs.writeFile(
      path.join(workFolder, 'package-lock.json'),
      JSON.stringify({ version: '1.0.1' }),
    );
    await fs.writeFile(
      path.join(workFolder, 'src/api/v1/swagger.yml'),
      unchangedSwagger,
    );
    await fs.writeFile(
      path.join(workFolder, 'src/admin/v2/swagger.yml'),
      changedBranchSwagger,
    );
    await fs.writeFile(
      path.join(workFolder, 'src/new/v99/swagger.yml'),
      changedMainSwagger.replace('version: 2.3.4', 'version: 99.0.0'),
    );

    const originalCwd = process.cwd();
    try {
      process.chdir(workFolder);
      await createContext(PR_NUMBER_PATCH);
      await assert.doesNotReject(checkLabel());
    } finally {
      process.chdir(originalCwd);
    }
  });
});
