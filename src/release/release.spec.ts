// release/release.spec.ts
/* eslint-disable camelcase -- Fixtures mirror GitHub API response fields. */

import { strict as assert } from 'node:assert';
import { afterEach, beforeEach, describe, it, mock } from 'node:test';

import { Octokit } from '@octokit/rest';
import nock from 'nock';

const repo = { owner: 'checkdigit', repo: 'example' };
const ROOT = '/repos/checkdigit/example';
const sha = 'a'.repeat(40);
const tag = 'v1.2.3';
const url = `https://github.com/checkdigit/example/releases/tag/${tag}`;
const outputs = new Map<string, string>();
const originalToken = process.env['GITHUB_TOKEN'];
const event = {
  eventName: 'pull_request_target',
  payload: {
    action: 'closed',
    pull_request: { number: 12, merged: true },
  },
  repo,
};

mock.module('@actions/core', {
  exports: {
    info: () => undefined,
    setOutput: (name: string, value: string) => outputs.set(name, value),
  },
});
mock.module('@actions/github', { exports: { context: event } });
const { default: main, releasePullRequest } = await import('./release.ts');
const api = () => new Octokit({ auth: 'test-token', request: { fetch } });
const release = () => releasePullRequest(api(), repo, 12);

function mergedPull(parents = 1) {
  return nock('https://api.github.com')
    .get(`${ROOT}/pulls/12`)
    .reply(200, { merged: true, merge_commit_sha: sha, base: { ref: 'main' } })
    .get(ROOT)
    .reply(200, { default_branch: 'main' })
    .get(`${ROOT}/commits/${sha}`)
    .reply(200, { sha, parents: Array.from({ length: parents }, () => ({})) });
}

function readManifest(calls: nock.Scope, version: unknown = '1.2.3') {
  return calls
    .get(`${ROOT}/contents/package.json`)
    .query({ ref: sha })
    .reply(200, {
      type: 'file',
      encoding: 'base64',
      content: Buffer.from(JSON.stringify({ version })).toString('base64'),
    });
}

function existingTag(calls: nock.Scope, target = sha) {
  return calls
    .get(`${ROOT}/git/ref/tags%2F${tag}`)
    .reply(200, { object: { type: 'commit', sha: target } });
}

function createRelease(calls: nock.Scope) {
  return calls
    .get(`${ROOT}/releases/tags/${tag}`)
    .reply(404, { message: 'Not Found' })
    .post(`${ROOT}/releases`, {
      tag_name: tag,
      target_commitish: sha,
      name: tag,
      draft: false,
      prerelease: false,
      generate_release_notes: true,
      make_latest: 'legacy',
    })
    .reply(201, { html_url: url });
}

beforeEach(() => {
  process.env['GITHUB_TOKEN'] = 'test-token';
});

afterEach(() => {
  nock.cleanAll();
  outputs.clear();
  event.eventName = 'pull_request_target';
  event.payload.action = 'closed';
  event.payload.pull_request.merged = true;
  if (originalToken === undefined) {
    delete process.env['GITHUB_TOKEN'];
  } else {
    process.env['GITHUB_TOKEN'] = originalToken;
  }
});

describe('release a merged pull request', () => {
  it('tags the exact squash commit using its package version and publishes generated release notes', async () => {
    const calls = createRelease(
      readManifest(mergedPull())
        .get(`${ROOT}/git/ref/tags%2F${tag}`)
        .reply(404, { message: 'Not Found' })
        .post(`${ROOT}/git/refs`, { ref: `refs/tags/${tag}`, sha })
        .reply(201, {}),
    );
    await release();
    assert.ok(calls.isDone());
    assert.deepEqual(Object.fromEntries(outputs), {
      version: '1.2.3',
      tag,
      'release-url': url,
    });
  });

  it('completes a release when an earlier attempt already created the matching tag', async () => {
    const calls = createRelease(existingTag(readManifest(mergedPull())));
    await release();
    assert.ok(calls.isDone());
    assert.equal(outputs.get('release-url'), url);
  });

  it('reuses an existing published release without changing it', async () => {
    const calls = existingTag(readManifest(mergedPull()))
      .get(`${ROOT}/releases/tags/${tag}`)
      .reply(200, { html_url: url, draft: false, prerelease: false });
    await release();
    assert.ok(calls.isDone());
    assert.equal(outputs.get('release-url'), url);
  });

  it('resolves an existing annotated tag before publishing', async () => {
    const calls = createRelease(
      readManifest(mergedPull())
        .get(`${ROOT}/git/ref/tags%2F${tag}`)
        .reply(200, { object: { type: 'tag', sha: 'b'.repeat(40) } })
        .get(`${ROOT}/commits/${tag}`)
        .reply(200, { sha }),
    );
    await release();
    assert.ok(calls.isDone());
  });

  it('refuses to move a version tag that points to another commit', async () => {
    const calls = existingTag(readManifest(mergedPull()), 'b'.repeat(40));
    await assert.rejects(release(), /already points to another commit/u);
    assert.ok(calls.isDone());
    assert.equal(outputs.size, 0);
  });

  it('propagates tag lookup permission failures without creating a tag', async () => {
    const calls = readManifest(mergedPull())
      .get(`${ROOT}/git/ref/tags%2F${tag}`)
      .reply(403, { message: 'Forbidden' });
    await assert.rejects(release(), { status: 403 });
    assert.ok(calls.isDone());
  });

  it('propagates release lookup permission failures without publishing', async () => {
    const calls = existingTag(readManifest(mergedPull()))
      .get(`${ROOT}/releases/tags/${tag}`)
      .reply(403, { message: 'Forbidden' });
    await assert.rejects(release(), { status: 403 });
    assert.ok(calls.isDone());
  });

  it('leaves existing drafts and prereleases for manual inspection', async () => {
    for (const state of [
      { draft: true, prerelease: false },
      { draft: false, prerelease: true },
    ]) {
      const calls = existingTag(readManifest(mergedPull()))
        .get(`${ROOT}/releases/tags/${tag}`)
        .reply(200, { html_url: url, ...state });
      await assert.rejects(
        release(),
        /already exists as a draft or prerelease/u,
      );
      assert.ok(calls.isDone());
    }
  });

  it('does not release closed PRs that were not merged', async () => {
    const calls = nock('https://api.github.com')
      .get(`${ROOT}/pulls/12`)
      .reply(200, { merged: false });
    await release();
    assert.ok(calls.isDone());
    assert.equal(outputs.size, 0);
  });

  it('does not release merges outside the default branch', async () => {
    const calls = nock('https://api.github.com')
      .get(`${ROOT}/pulls/12`)
      .reply(200, { merged: true, base: { ref: 'maintenance' } })
      .get(ROOT)
      .reply(200, { default_branch: 'main' });
    await release();
    assert.ok(calls.isDone());
    assert.equal(outputs.size, 0);
  });

  it('rejects a missing merge SHA', async () => {
    const calls = nock('https://api.github.com')
      .get(`${ROOT}/pulls/12`)
      .reply(200, {
        merged: true,
        merge_commit_sha: null,
        base: { ref: 'main' },
      })
      .get(ROOT)
      .reply(200, { default_branch: 'main' });
    await assert.rejects(release(), /no merge commit SHA/u);
    assert.ok(calls.isDone());
  });

  it('rejects ordinary merge commits before creating a tag or release', async () => {
    const calls = mergedPull(2);
    await assert.rejects(release(), /requires a squash merge/u);
    assert.ok(calls.isDone());
  });

  it('rejects missing, invalid, and prerelease versions before creating a tag', async () => {
    for (const version of [
      undefined,
      123,
      'invalid',
      'v1.2.3',
      '1.2.3-beta.1',
    ]) {
      const calls = readManifest(mergedPull(), version ?? null);
      await assert.rejects(release(), /stable semantic version/u);
      assert.ok(calls.isDone());
    }
  });

  it('rejects a package.json response that is not a base64 file', async () => {
    const calls = mergedPull()
      .get(`${ROOT}/contents/package.json`)
      .query({ ref: sha })
      .reply(200, []);
    await assert.rejects(release(), /Unable to read package.json/u);
    assert.ok(calls.isDone());
  });

  it('rejects unrelated events and PR activity other than closing', async () => {
    event.eventName = 'push';
    await assert.rejects(main(), /requires a closed pull request event/u);
    event.eventName = 'pull_request';
    event.payload.action = 'opened';
    await assert.rejects(main(), /requires a closed pull request event/u);
  });

  it('ignores an unmerged close without requiring credentials', async () => {
    event.payload.pull_request.merged = false;
    await main();
    assert.equal(outputs.size, 0);
  });

  it('requires GITHUB_TOKEN for a merged PR', async () => {
    delete process.env['GITHUB_TOKEN'];
    await assert.rejects(main(), {
      message: 'incorrect action configuration: GITHUB_TOKEN is not set',
    });
  });

  it('uses the event PR and repository for either supported merge event', async () => {
    for (const name of ['pull_request', 'pull_request_target']) {
      event.eventName = name;
      const calls = existingTag(readManifest(mergedPull()))
        .get(`${ROOT}/releases/tags/${tag}`)
        .reply(200, { html_url: url, draft: false, prerelease: false });
      await main();
      assert.ok(calls.isDone());
      assert.equal(outputs.get('release-url'), url);
    }
  });
});

/* eslint-enable camelcase */
