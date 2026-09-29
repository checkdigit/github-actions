// dependency-review/github.spec.ts

import { strict as assert } from 'node:assert';
import { afterEach, describe, it } from 'node:test';

import nock from 'nock';

import {
  buildInventory,
  createOctokit,
  fetchLockfiles,
  type RepositoryContext,
  resolveRevisions,
} from './github.ts';

/* eslint-disable camelcase */

const context: RepositoryContext = {
  owner: 'owner',
  repo: 'repo',
  eventName: 'pull_request',
  event: {
    pull_request: { base: { sha: 'base' }, head: { sha: 'head' }, number: 7 },
  },
};

describe('GitHub revision and lockfile reader', () => {
  afterEach(() => nock.cleanAll());

  it('resolves pull request, merge group, and explicit revisions', () => {
    assert.deepEqual(resolveRevisions(context), { base: 'base', head: 'head' });
    assert.deepEqual(
      resolveRevisions(context, 'explicit-base', 'explicit-head'),
      {
        base: 'explicit-base',
        head: 'explicit-head',
      },
    );
    assert.deepEqual(
      resolveRevisions({
        ...context,
        eventName: 'merge_group',
        event: {
          merge_group: { base_sha: 'merge-base', head_sha: 'merge-head' },
        },
      }),
      { base: 'merge-base', head: 'merge-head' },
    );
    assert.throws(
      () => resolveRevisions({ ...context, eventName: 'push', event: {} }),
      /Unable to determine base and head/u,
    );
  });

  it('walks non-recursive trees and reads multiple lockfile blobs', async () => {
    const lock = JSON.stringify({
      lockfileVersion: 3,
      packages: { 'node_modules/pkg': { version: '1.0.0' } },
    });
    const api = nock('https://api.github.com')
      .get('/repos/owner/repo/git/commits/head')
      .reply(200, { tree: { sha: 'root-tree' } })
      .get('/repos/owner/repo/git/trees/root-tree')
      .reply(200, {
        truncated: false,
        tree: [
          {
            path: 'package-lock.json',
            type: 'blob',
            mode: '100644',
            sha: 'blob-1',
          },
          { path: 'packages', type: 'tree', mode: '040000', sha: 'sub-tree' },
        ],
      })
      .get('/repos/owner/repo/git/trees/sub-tree')
      .reply(200, {
        truncated: false,
        tree: [
          {
            path: 'package-lock.json',
            type: 'blob',
            mode: '100644',
            sha: 'blob-2',
          },
        ],
      })
      .get('/repos/owner/repo/git/blobs/blob-1')
      .reply(200, {
        encoding: 'base64',
        content: Buffer.from(lock).toString('base64'),
      })
      .get('/repos/owner/repo/git/blobs/blob-2')
      .reply(200, {
        encoding: 'base64',
        content: Buffer.from(lock).toString('base64'),
      });

    const lockfiles = await fetchLockfiles(
      createOctokit('test-token'),
      context,
      'head',
    );
    assert.deepEqual(
      lockfiles.map((item) => item.path),
      ['package-lock.json', 'packages/package-lock.json'],
    );
    assert.equal(buildInventory(lockfiles).length, 2);
    assert.ok(api.isDone());
  });

  it('fails when GitHub truncates even a non-recursive tree', async () => {
    nock('https://api.github.com')
      .get('/repos/owner/repo/git/commits/head')
      .reply(200, { tree: { sha: 'root-tree' } })
      .get('/repos/owner/repo/git/trees/root-tree')
      .reply(200, { truncated: true, tree: [] });
    await assert.rejects(
      fetchLockfiles(createOctokit('test-token'), context, 'head'),
      /truncated a non-recursive tree/u,
    );
  });
});

/* eslint-enable camelcase */
