// update-dependencies/publish.spec.ts
/* eslint-disable camelcase -- Fixtures mirror GitHub API response fields. */
// update-dependencies/publish.spec.ts

import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';

import { summary } from '@actions/core';
import { getOctokit } from '@actions/github';
import nock from 'nock';

import { publishUpdate } from './update-dependencies.ts';

const API = 'https://api.github.com';
const repo = { owner: 'checkdigit', repo: 'example' };
const ROOT = '/repos/checkdigit/example';
const head = 'a'.repeat(40);
const oid = 'b'.repeat(40);

function prepare(isVerified: boolean) {
  return nock(API)
    .get(`${ROOT}/labels/PATCH`)
    .reply(200, { name: 'PATCH' })
    .post(`${ROOT}/issues`, (body: { title: string }) =>
      body.title.includes('1.0.1'),
    )
    .reply(201, {
      number: 10,
      html_url: 'https://github.com/checkdigit/example/issues/10',
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
            fileChanges: { additions: { path: string; contents: string }[] };
          };
        };
      }) => {
        assert.equal(body.variables.input.expectedHeadOid, head);
        assert.deepEqual(
          body.variables.input.fileChanges.additions.map((file) => file.path),
          ['package.json', 'package-lock.json'],
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
  it('opens a linked PR only after signature verification and requests reviewers', async (testContext) => {
    testContext.mock.method(summary, 'write', async () => summary);
    process.env['INPUT_REVIEWERS'] = 'alice,team:maintainers';
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
      .post(`${ROOT}/pulls/11/requested_reviewers`, {
        reviewers: ['alice'],
        team_reviewers: ['maintainers'],
      })
      .reply(201, {});
    try {
      await publishUpdate(
        getOctokit('test-token', { request: { fetch } }),
        repo,
        'main',
        head,
        '1.0.1',
        ['- example: 1.0.0 → 1.1.0'],
        ['test'],
        'minor',
      );
      assert.ok(requests.isDone());
    } finally {
      delete process.env['INPUT_REVIEWERS'];
      nock.cleanAll();
    }
  });

  it('refuses to open a PR when the commit is unverified', async () => {
    const requests = prepare(false);
    try {
      await assert.rejects(
        publishUpdate(
          getOctokit('test-token', { request: { fetch } }),
          repo,
          'main',
          head,
          '1.0.1',
          ['update'],
          ['test'],
          'minor',
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
