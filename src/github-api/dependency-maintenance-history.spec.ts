// github-api/dependency-maintenance-history.spec.ts
/* eslint-disable camelcase -- Fixtures mirror GitHub API fields. */

import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';

import { Octokit } from '@octokit/rest';
import nock from 'nock';

import {
  checkDependencyMaintenance,
  DAY,
  maintenanceHistory,
} from './dependency-maintenance.ts';

const ROOT = '/repos/checkdigit/example';
const repo = { owner: 'checkdigit', repo: 'example' };
const api = () => new Octokit({ auth: 'test', request: { fetch } });
const options = {
  maxAgeDays: 30,
  contributorLookbackDays: 90,
  fallbackAssignee: '',
  command: '/update-dependencies',
  issueTitle: 'Update dependencies',
};
function issue(overrides: object = {}) {
  return {
    number: 10,
    title: 'Update dependencies',
    state: 'closed',
    state_reason: 'completed',
    closed_at: new Date().toISOString(),
    html_url: 'https://github.com/checkdigit/example/issues/10',
    ...overrides,
  };
}
function requests(issues: object[]) {
  return nock('https://api.github.com')
    .get(`${ROOT}/issues`)
    .query(true)
    .reply(200, issues);
}
function expectCreation(calls: nock.Scope) {
  return calls
    .get(ROOT)
    .reply(200, { default_branch: 'main' })
    .get(`${ROOT}/commits`)
    .query(true)
    .reply(200, [])
    .post(
      `${ROOT}/issues`,
      (body: { title: string; assignees: string[] }) =>
        body.title === options.issueTitle && body.assignees.length === 0,
    )
    .reply(201, {
      html_url: 'https://github.com/checkdigit/example/issues/11',
    });
}

describe('issue-based maintenance history', () => {
  it('creates an update issue immediately when no history exists', async () => {
    const calls = expectCreation(requests([]));
    try {
      assert.equal(
        await checkDependencyMaintenance(api(), repo, options),
        'https://github.com/checkdigit/example/issues/11',
      );
      assert.ok(calls.isDone());
    } finally {
      nock.cleanAll();
    }
  });
  it('reuses an open manual issue without reassigning it', async () => {
    const calls = requests([issue({ state: 'open', closed_at: null })]);
    try {
      assert.equal(
        await checkDependencyMaintenance(api(), repo, options),
        'https://github.com/checkdigit/example/issues/10',
      );
      assert.ok(calls.isDone());
    } finally {
      nock.cleanAll();
    }
  });
  it('creates a reminder after the latest completed issue is overdue', async () => {
    const calls = expectCreation(
      requests([
        issue({ closed_at: new Date(Date.now() - 40 * DAY).toISOString() }),
      ]),
    );
    try {
      await checkDependencyMaintenance(api(), repo, options);
      assert.ok(calls.isDone());
    } finally {
      nock.cleanAll();
    }
  });
  it('does not create an issue after recent completion', async () => {
    const calls = requests([issue()]);
    try {
      assert.equal(
        await checkDependencyMaintenance(api(), repo, options),
        undefined,
      );
      assert.ok(calls.isDone());
    } finally {
      nock.cleanAll();
    }
  });
  it('uses the latest completion regardless of response order', () => {
    const older = new Date(Date.now() - 40 * DAY).toISOString();
    const current = new Date().toISOString();
    assert.equal(
      maintenanceHistory(
        [issue({ closed_at: older }), issue({ closed_at: current })],
        options.issueTitle,
      ).completedAt,
      Date.parse(current),
    );
  });
  it('ignores cancelled issues, unrelated issues, and PRs returned by the issues endpoint', () => {
    assert.equal(
      maintenanceHistory(
        [
          issue({ state_reason: 'not_planned' }),
          issue({ title: 'Fix login' }),
          issue({ pull_request: {} }),
        ],
        options.issueTitle,
      ).completedAt,
      undefined,
    );
  });
});
/* eslint-enable camelcase */
