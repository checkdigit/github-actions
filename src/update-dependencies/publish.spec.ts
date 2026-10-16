// update-dependencies/publish.spec.ts
/* eslint-disable camelcase -- Fixtures mirror GitHub API response fields. */

import { strict as assert } from 'node:assert';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { summary } from '@actions/core';
import { Octokit } from '@octokit/rest';
import nock from 'nock';

import { publishUpdate } from './publish.ts';

const API = 'https://api.github.com';
const repo = { owner: 'checkdigit', repo: 'example' };
const ROOT = '/repos/checkdigit/example';
const head = 'a'.repeat(40);
const oid = 'b'.repeat(40);

function prepare(isVerified: boolean) {
  return nock(API)
    .get(`${ROOT}/labels/PATCH`)
    .reply(200, { name: 'PATCH' })
    .get(`${ROOT}/issues/10`)
    .reply(200, {
      number: 10,
      html_url: 'https://github.com/checkdigit/example/issues/10',
      assignees: [{ login: 'alice' }],
    })
    .post(`${ROOT}/git/refs`, {
      ref: 'refs/heads/automation/dependency-updates',
      sha: head,
    })
    .reply(201, {})
    .post(
      '/graphql',
      (body: {
        variables: {
          input: {
            expectedHeadOid: string;
            fileChanges: {
              additions: { path: string; contents: string }[];
              deletions: { path: string }[];
            };
          };
        };
      }) => {
        assert.equal(body.variables.input.expectedHeadOid, head);
        assert.deepEqual(
          body.variables.input.fileChanges.additions.map((file) => file.path),
          ['package.json', 'package-lock.json', 'fixed.ts', 'new.ts'],
        );
        assert.deepEqual(body.variables.input.fileChanges.deletions, [
          { path: 'removed.ts' },
        ]);
        assert.equal(
          Buffer.from(
            body.variables.input.fileChanges.additions[2]?.contents ?? '',
            'base64',
          ).toString(),
          'formatted source',
        );
        assert.equal(Object.hasOwn(body.variables.input, 'author'), false);
        return true;
      },
    )
    .reply(200, { data: { createCommitOnBranch: { commit: { oid } } } })
    .get(`${ROOT}/commits/${oid}`)
    .reply(200, { commit: { verification: { verified: isVerified } } });
}

describe('dependency update publishing', () => {
  const originalDirectory = process.cwd();
  const fixture = { directory: '' };
  beforeEach(async () => {
    fixture.directory = await mkdtemp(
      path.join(tmpdir(), 'dependency-publish-'),
    );
    await Promise.all(
      ['package.json', 'package-lock.json', 'fixed.ts', 'new.ts'].map(
        async (file) =>
          writeFile(path.join(fixture.directory, file), 'formatted source'),
      ),
    );
    process.chdir(fixture.directory);
  });
  afterEach(async () => {
    process.chdir(originalDirectory);
    await rm(fixture.directory, { recursive: true, force: true });
  });
  it('opens a linked PR only after signature verification and copies current issue assignees', async (testContext) => {
    testContext.mock.method(summary, 'write', async () => summary);

    const requests = prepare(true)
      .post(
        `${ROOT}/pulls`,
        (body: { body: string; head: string }) =>
          body.body.includes('Closes #10') &&
          body.head === 'automation/dependency-updates',
      )
      .reply(201, {
        number: 11,
        html_url: 'https://github.com/checkdigit/example/pull/11',
      })
      .post(`${ROOT}/issues/11/labels`, { labels: ['PATCH'] })
      .reply(200, [])
      .post(`${ROOT}/issues/11/assignees`, { assignees: ['alice'] })
      .reply(201, {})
      .post(`${ROOT}/issues/10/comments`)
      .reply(201, {});
    try {
      await publishUpdate(
        new Octokit({ auth: 'test-token', request: { fetch } }),
        repo,
        'main',
        head,
        '1.0.1',
        [
          'package.json',
          'package-lock.json',
          'fixed.ts',
          'new.ts',
          'removed.ts',
        ],
        { issueNumber: 10 },
      );
      assert.ok(requests.isDone());
    } finally {
      nock.cleanAll();
    }
  });

  it('refuses to open a PR when the commit is unverified', async () => {
    const requests = prepare(false);
    try {
      await assert.rejects(
        publishUpdate(
          new Octokit({ auth: 'test-token', request: { fetch } }),
          repo,
          'main',
          head,
          '1.0.1',
          [
            'package.json',
            'package-lock.json',
            'fixed.ts',
            'new.ts',
            'removed.ts',
          ],
          { issueNumber: 10 },
        ),
        { message: /Commit is not verified/u },
      );
      assert.ok(requests.isDone());
    } finally {
      nock.cleanAll();
    }
  });
});

/* eslint-enable camelcase */
