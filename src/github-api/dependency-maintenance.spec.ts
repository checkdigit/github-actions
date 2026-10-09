// github-api/dependency-maintenance.spec.ts

import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';

import { Octokit } from '@octokit/rest';
import nock from 'nock';

import {
  findAssignee,
  positiveDays,
  rankContributors,
} from './dependency-maintenance.ts';

const repo = { owner: 'checkdigit', repo: 'example' };
const ROOT = '/repos/checkdigit/example';
const api = () => new Octokit({ auth: 'test', request: { fetch } });
describe('maintenance ownership', () => {
  it('ranks recent human authors with deterministic ties and excludes bots', () => {
    const authors = ['bob', 'alice', 'bob', 'alice', 'carol'];
    const commits = authors.map((login) => ({
      author: { login, type: 'User' },
    }));
    commits.push({ author: { login: 'robot', type: 'Bot' } });
    assert.deepEqual(rankContributors([...commits, { author: null }]), [
      'alice',
      'bob',
      'carol',
    ]);
  });
  it('rejects invalid lookback settings', () => {
    assert.equal(positiveDays('', 30), 30);
    assert.throws(() => positiveDays('0', 30), {
      message: 'Day counts must be positive integers.',
    });
  });
  it('falls back when contributors cannot be assigned', async () => {
    const requests = nock('https://api.github.com')
      .get(`${ROOT}/commits`)
      .query(true)
      .reply(200, [{ author: { login: 'alice', type: 'User' } }])
      .get(`${ROOT}/assignees/alice`)
      .reply(404)
      .get(`${ROOT}/assignees/owner`)
      .reply(204);
    try {
      assert.equal(
        await findAssignee(api(), repo, 'main', 90, 'owner'),
        'owner',
      );
      assert.ok(requests.isDone());
    } finally {
      nock.cleanAll();
    }
  });
});
