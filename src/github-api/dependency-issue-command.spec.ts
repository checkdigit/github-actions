// github-api/dependency-issue-command.spec.ts
/* eslint-disable camelcase -- Fixture mirrors GitHub PR event fields. */

import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';

import { Octokit } from '@octokit/rest';
import nock from 'nock';

import { authorizeComment } from './dependency-issue-command.ts';

const repo = { owner: 'checkdigit', repo: 'example' };
const ROOT = '/repos/checkdigit/example';
const api = () => new Octokit({ auth: 'test', request: { fetch } });
const payload = {
  action: 'created',
  issue: { number: 10 },
  comment: {
    body: '/update-dependencies',
    user: { login: 'alice', type: 'User' },
  },
};

describe('independent issue command authorization', () => {
  it('accepts an open manual issue with any title, creator, or body', async () => {
    const calls = nock('https://api.github.com')
      .get(`${ROOT}/collaborators/alice/permission`)
      .reply(200, { permission: 'write' })
      .get(`${ROOT}/issues/10`)
      .reply(200, {
        number: 10,
        state: 'open',
        title: 'Refresh our libraries',
        body: 'Manually created',
        user: { login: 'someone' },
      });
    try {
      assert.equal(
        await authorizeComment(api(), repo, payload, '/update-dependencies'),
        10,
      );
      assert.ok(calls.isDone());
    } finally {
      nock.cleanAll();
    }
  });
  it('rejects a read-only commenter before fetching the issue', async () => {
    const calls = nock('https://api.github.com')
      .get(`${ROOT}/collaborators/alice/permission`)
      .reply(200, { permission: 'read' });
    try {
      assert.equal(
        await authorizeComment(api(), repo, payload, '/update-dependencies'),
        undefined,
      );
      assert.ok(calls.isDone());
    } finally {
      nock.cleanAll();
    }
  });
  it('rejects a closed issue', async () => {
    const calls = nock('https://api.github.com')
      .get(`${ROOT}/collaborators/alice/permission`)
      .reply(200, { permission: 'write' })
      .get(`${ROOT}/issues/10`)
      .reply(200, { number: 10, state: 'closed' });
    try {
      assert.equal(
        await authorizeComment(api(), repo, payload, '/update-dependencies'),
        undefined,
      );
      assert.ok(calls.isDone());
    } finally {
      nock.cleanAll();
    }
  });
  it('ignores PR comments, edits, bots, and commands with extra arguments', async () => {
    assert.equal(
      await authorizeComment(
        api(),
        repo,
        { ...payload, issue: { number: 10, pull_request: {} } },
        '/update-dependencies',
      ),
      undefined,
    );
    assert.equal(
      await authorizeComment(
        api(),
        repo,
        { ...payload, action: 'edited' },
        '/update-dependencies',
      ),
      undefined,
    );
    assert.equal(
      await authorizeComment(
        api(),
        repo,
        {
          ...payload,
          comment: { ...payload.comment, user: { login: 'bot', type: 'Bot' } },
        },
        '/update-dependencies',
      ),
      undefined,
    );
    assert.equal(
      await authorizeComment(
        api(),
        repo,
        {
          ...payload,
          comment: {
            ...payload.comment,
            body: '/update-dependencies; echo bad',
          },
        },
        '/update-dependencies',
      ),
      undefined,
    );
  });
});
/* eslint-enable camelcase */
