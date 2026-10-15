// check-dependencies/check-dependencies.spec.ts

/* eslint-disable camelcase -- GitHub API request and response fields use snake case. */

import { strict as assert } from 'node:assert';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, it, mock } from 'node:test';

import nock from 'nock';

import main from './check-dependencies.ts';

const NOW = new Date('2026-10-15T12:00:00Z');
const ISSUE_URL = 'https://github.com/checkdigit/test/issues/42';
const REPO_PATH = '/repos/checkdigit/test';
const originalEnvironment = { ...process.env };

function issue(overrides: object = {}) {
  return {
    number: 1,
    title: 'Update dependencies',
    labels: [],
    state: 'closed',
    state_reason: 'completed',
    closed_at: '2026-08-01T12:00:00Z',
    ...overrides,
  };
}

function commit(login: string | null, date = NOW.toISOString(), type = 'User') {
  return {
    author: login === null ? null : { login, type },
    commit: { author: { date } },
  };
}

function mockIssues(issues: object[] = []) {
  return nock('https://api.github.com')
    .get(`${REPO_PATH}/issues`)
    .query({ state: 'all', per_page: 100 })
    .reply(200, issues);
}

function mockCommits(commits: object[] = []) {
  return nock('https://api.github.com')
    .get(`${REPO_PATH}/commits`)
    .query({
      since: '2026-07-17T12:00:00.000Z',
      until: NOW.toISOString(),
      per_page: 100,
    })
    .reply(200, commits);
}

function mockAssignee(login: string, status = 204) {
  return nock('https://api.github.com')
    .get(`${REPO_PATH}/assignees/${login}`)
    .reply(status);
}

function mockCreation(assignees: string[] = []) {
  return nock('https://api.github.com')
    .post(`${REPO_PATH}/issues`, (body) => {
      assert.equal(body.title, 'Update dependencies');
      assert.deepEqual(body.labels, ['DEPENDENCY UPDATE']);
      assert.equal(
        body.body,
        '<!-- check-dependencies -->\n\nupdate to the latest dependencies and workflows',
      );
      assert.deepEqual(body.assignees, assignees);
      return true;
    })
    .reply(201, { html_url: ISSUE_URL });
}

describe('check dependencies', () => {
  let outputDirectory: string;
  let outputFile: string;

  beforeEach(async () => {
    process.env = { ...originalEnvironment };
    process.env['GITHUB_TOKEN'] = 'test-token';
    process.env['GITHUB_REPOSITORY'] = 'checkdigit/test';
    delete process.env['INPUT_MAX-AGE-DAYS'];
    delete process.env['INPUT_CONTRIBUTOR-LOOKBACK-DAYS'];
    delete process.env['INPUT_FALLBACK-ASSIGNEE'];
    outputDirectory = await mkdtemp(
      path.join(os.tmpdir(), 'check-dependencies-'),
    );
    outputFile = path.join(outputDirectory, 'output');
    await writeFile(outputFile, '');
    // Hooks run sequentially within this suite.
    // eslint-disable-next-line require-atomic-updates
    process.env['GITHUB_OUTPUT'] = outputFile;
    mock.timers.enable({ apis: ['Date'], now: NOW });
    nock.disableNetConnect();
  });

  afterEach(async () => {
    const pending = nock.pendingMocks();
    mock.timers.reset();
    nock.cleanAll();
    nock.enableNetConnect();
    process.env = { ...originalEnvironment };
    await rm(outputDirectory, { recursive: true, force: true });
    assert.deepEqual(pending, []);
  });

  [
    issue({ state: 'open', closed_at: null }),
    issue({
      state: 'open',
      title: 'Renamed maintenance',
      body: '<!-- check-dependencies -->',
      closed_at: null,
    }),
    issue({ closed_at: '2026-10-01T12:00:00Z' }),
  ].forEach((existing) => {
    it(`skips creation for ${existing.title}, ${existing.state}, ${existing.closed_at}`, async () => {
      mockIssues([existing]);
      await main();
      const output = await readFile(outputFile, 'utf8');
      assert.ok(output.includes('issue-url<<'));
      assert.ok(!output.includes(ISSUE_URL));
    });
  });

  it('uses the most recent completed closure rather than issue order', async () => {
    mockIssues([
      issue(),
      issue({ closed_at: '2026-10-14T12:00:00Z' }),
      issue({ closed_at: '2026-08-01T12:00:00Z' }),
    ]);
    await main();
  });

  for (const title of [
    'update dependencies',
    'update dependencies and workflows',
    'update dependencies and setup OIDC publishing',
    'Update to latest dependencies',
    'dependency / CI updates 2026-10-01',
    'update to latest dependencies',
    'Dependency updates',
    '  UPDATE DEPENDENCIES AND WORKFLOWS  ',
  ]) {
    for (const state of ['open', 'closed']) {
      it(`recognizes historical title "${title}" when ${state}`, async () => {
        mockIssues([
          issue({ title, state, closed_at: '2026-10-01T12:00:00Z' }),
        ]);
        await main();
      });
    }
  }

  for (const labels of [
    [{ name: 'DEPENDENCY UPDATE' }],
    ['DEPENDENCY UPDATE'],
    [{ name: 'dependency update' }],
  ]) {
    for (const state of ['open', 'closed']) {
      it(`recognizes label ${JSON.stringify(labels)} when ${state} regardless of title`, async () => {
        mockIssues([
          issue({
            title: 'Refresh project tooling',
            labels,
            state,
            closed_at: '2026-10-01T12:00:00Z',
          }),
        ]);
        await main();
      });
    }
  }

  it('excludes unrelated titles and labels from maintenance history', async () => {
    const unrelatedTitles = [
      'Investigate dependencies failure',
      'Update documentation about dependencies',
      'CI updates 2026-10-01',
      'Update dependenciesChecker',
    ];
    mockIssues(
      unrelatedTitles.flatMap((title) => [
        issue({
          title,
          state: 'open',
          labels: [{ name: 'DEPENDENCY UPDATE REQUEST' }],
        }),
        issue({ title, closed_at: '2026-10-14T12:00:00Z', labels: ['bug'] }),
      ]),
    );
    mockCommits();
    mockCreation();
    await main();
  });

  it('still ignores PRs and not-planned closures when matched by label or historical title', async () => {
    mockIssues([
      issue({
        title: 'Refresh tooling',
        labels: ['DEPENDENCY UPDATE'],
        state: 'open',
        pull_request: {},
      }),
      issue({
        title: 'dependency / CI updates 2026-10-01',
        state: 'open',
        pull_request: {},
      }),
      issue({
        title: 'Refresh tooling',
        labels: ['DEPENDENCY UPDATE'],
        state_reason: 'not_planned',
        closed_at: '2026-10-14T12:00:00Z',
      }),
      issue({
        title: 'update dependencies and workflows',
        state_reason: 'not_planned',
        closed_at: '2026-10-14T12:00:00Z',
      }),
    ]);
    mockCommits();
    mockCreation();
    await main();
  });

  it('creates one overdue issue, ignoring PRs and closures not completed', async () => {
    mockIssues([
      issue(),
      issue({ closed_at: '2026-10-14T12:00:00Z', state_reason: 'not_planned' }),
      issue({ closed_at: '2026-10-14T12:00:00Z', state_reason: null }),
      issue({ state: 'open', pull_request: { url: 'https://example.com/pr' } }),
      issue({ title: 'Unrelated issue', state: 'open' }),
    ]);
    mockCommits();
    mockCreation();
    await main();
    assert.ok((await readFile(outputFile, 'utf8')).includes(ISSUE_URL));
  });

  it('ranks human authors by commit count and skips ineligible contributors', async () => {
    mockIssues();
    mockCommits([
      commit('frequent'),
      commit('frequent'),
      commit('frequent'),
      commit('eligible'),
      commit('eligible'),
      commit('other'),
      commit('automation[bot]', undefined, 'Bot'),
      commit('automation[bot]', undefined, 'Bot'),
      commit('automation[bot]', undefined, 'Bot'),
      commit('automation[bot]', undefined, 'Bot'),
      commit(null),
    ]);
    mockAssignee('frequent', 404);
    mockAssignee('eligible');
    mockCreation(['eligible']);
    await main();
  });

  it('breaks contribution ties by latest authored commit then username', async () => {
    mockIssues();
    mockCommits([
      commit('older', '2026-10-01T12:00:00Z'),
      commit('zeta'),
      commit('alpha'),
    ]);
    mockAssignee('alpha');
    mockCreation(['alpha']);
    await main();
  });

  it('tries the fallback after recent contributors', async () => {
    process.env['INPUT_FALLBACK-ASSIGNEE'] = 'Fallback';
    mockIssues();
    mockCommits([commit('recent')]);
    mockAssignee('recent', 404);
    mockAssignee('fallback');
    mockCreation(['fallback']);
    await main();
  });

  it('excludes commits authored outside the lookback even if recently committed', async () => {
    mockIssues();
    mockCommits([
      commit('stale', '2026-01-01T12:00:00Z'),
      commit('future', '2026-10-16T12:00:00Z'),
      commit('recent'),
    ]);
    mockAssignee('recent');
    mockCreation(['recent']);
    await main();
  });

  it('does not retry a fallback already checked as a recent contributor', async () => {
    process.env['INPUT_FALLBACK-ASSIGNEE'] = 'recent';
    mockIssues();
    mockCommits([commit('recent')]);
    mockAssignee('recent', 404);
    mockCreation();
    await main();
  });

  it('creates an unassigned issue if nobody is eligible', async () => {
    process.env['INPUT_FALLBACK-ASSIGNEE'] = 'fallback';
    mockIssues();
    mockCommits();
    mockAssignee('fallback', 404);
    mockCreation();
    await main();
  });

  it('propagates assignment permission failures without creating an issue', async () => {
    mockIssues();
    mockCommits([commit('recent')]);
    mockAssignee('recent', 403);
    await assert.rejects(main, { status: 403 });
  });

  it('paginates issues before deciding whether to create one', async () => {
    nock('https://api.github.com')
      .get(`${REPO_PATH}/issues`)
      .query({ state: 'all', per_page: 100 })
      .reply(200, [issue()], {
        Link: '<https://api.github.com/repos/checkdigit/test/issues?state=all&per_page=100&page=2>; rel="next"',
      })
      .get(`${REPO_PATH}/issues`)
      .query({ state: 'all', per_page: 100, page: 2 })
      .reply(200, [issue({ state: 'open' })]);
    await main();
  });

  it('paginates commits when ranking authors', async () => {
    mockIssues();
    nock('https://api.github.com')
      .get(`${REPO_PATH}/commits`)
      .query(true)
      .reply(200, [commit('first'), commit('second')], {
        Link: '<https://api.github.com/repos/checkdigit/test/commits?page=2>; rel="next"',
      })
      .get(`${REPO_PATH}/commits`)
      .query({ page: 2 })
      .reply(200, [commit('second')]);
    mockAssignee('second');
    mockCreation(['second']);
    await main();
  });

  it('honors custom intervals and creates at the exact due boundary', async () => {
    process.env['INPUT_MAX-AGE-DAYS'] = '14';
    process.env['INPUT_CONTRIBUTOR-LOOKBACK-DAYS'] = '7';
    mockIssues([issue({ closed_at: '2026-10-01T12:00:00Z' })]);
    nock('https://api.github.com')
      .get(`${REPO_PATH}/commits`)
      .query({
        since: '2026-10-08T12:00:00.000Z',
        until: NOW.toISOString(),
        per_page: 100,
      })
      .reply(200, []);
    mockCreation();
    await main();
  });

  for (const input of ['0', '-1', '1.5', 'invalid', 'Infinity', '100000001']) {
    it(`rejects invalid day input ${input}`, async () => {
      process.env['INPUT_MAX-AGE-DAYS'] = input;
      await assert.rejects(main, /max-age-days must be a positive integer/u);
    });
  }

  it('validates the contributor lookback', async () => {
    process.env['INPUT_CONTRIBUTOR-LOOKBACK-DAYS'] = '-1';
    await assert.rejects(main, {
      message:
        'incorrect action configuration: contributor-lookback-days must be a positive integer number of days',
    });
  });

  it('requires a token', async () => {
    delete process.env['GITHUB_TOKEN'];
    await assert.rejects(main, {
      message: 'incorrect action configuration: GITHUB_TOKEN is not set',
    });
  });

  for (const repository of [
    '',
    'owner',
    '/repo',
    'owner/',
    'owner/repo/extra',
  ]) {
    it(`rejects malformed repository ${repository}`, async () => {
      process.env['GITHUB_REPOSITORY'] = repository;
      await assert.rejects(main, /unable to get repo/u);
    });
  }

  it('propagates GitHub failures', async () => {
    nock('https://api.github.com')
      .get(`${REPO_PATH}/issues`)
      .query(true)
      .reply(403, { message: 'Forbidden' });
    await assert.rejects(main, { status: 403 });
  });

  it('propagates issue creation failures without publishing a URL', async () => {
    mockIssues();
    mockCommits();
    nock('https://api.github.com')
      .post(`${REPO_PATH}/issues`)
      .reply(422, { message: 'Validation failed' });
    await assert.rejects(main, { status: 422 });
    assert.ok(!(await readFile(outputFile, 'utf8')).includes(ISSUE_URL));
  });
});

/* eslint-enable camelcase */
