// nocks/github.test.ts
import os from 'node:os';
import { promises as fs } from 'node:fs';
import path from 'node:path';

import nock from 'nock';
import { v4 as uuid } from 'uuid';

export const PR_NUMBER_PATCH = 1;
export const PR_NUMBER_MINOR = 20;
export const PR_NUMBER_MAJOR = 300;
export const PR_NUMBER_DEFAULT = PR_NUMBER_PATCH;

export interface GithubNock {
  labelPackageVersionMain?: string;
}

export async function createGithubEventFile(prNumber = PR_NUMBER_DEFAULT): Promise<string> {
  const filePath = path.join(os.tmpdir(), uuid());
  await fs.writeFile(
    filePath,
    JSON.stringify({
      // eslint-disable-next-line camelcase
      pull_request: {
        number: prNumber,
      },
    }),
  );
  return filePath;
}

export default function (options?: GithubNock): void {
  nock('https://api.github.com/')
    .persist()
    .get(`/repos/checkdigit/nocomments/issues/${PR_NUMBER_DEFAULT}/comments`)
    .reply(200);
  nock('https://api.github.com/')
    .persist()
    .post(`/repos/checkdigit/nocomments/issues/${PR_NUMBER_DEFAULT}/comments`)
    .reply(200);

  nock('https://api.github.com/')
    .persist()
    .get(`/repos/checkdigit/comments/issues/${PR_NUMBER_DEFAULT}/comments`)
    .reply(200, () => [
      {
        id: 1,
        body: 'Beta Published - Install Command: npm install @checktest/canberemoved',
      },
      {
        id: 2,
        body: 'normal comment',
      },
      {
        id: 3,
        body: 'Beta Published - Install Command: npm install @checktest/canberemoved',
      },
    ]);

  nock('https://api.github.com/')
    .persist()
    .get(`/repos/checkdigit/preview/pulls/${PR_NUMBER_DEFAULT}/requested_reviewers`)
    .reply(200, () => ({
      users: [],
    }));

  nock('https://api.github.com/')
    .persist()
    .get(`/repos/checkdigit/previewOutstanding/pulls/${PR_NUMBER_DEFAULT}/requested_reviewers`)
    .reply(200, () => ({
      users: [
        {
          login: 'bob',
        },
        {
          login: 'carl',
        },
      ],
    }));

  nock('https://api.github.com/')
    .persist()
    .get(`/repos/checkdigit/previewOldReviews/pulls/${PR_NUMBER_DEFAULT}/requested_reviewers`)
    .reply(200, () => ({
      users: [
        {
          login: 'commituser4',
        },
        {
          login: 'commituser5',
        },
        {
          login: 'commituser6',
        },
      ],
    }));

  nock('https://api.github.com/')
    .persist()
    .get(`/repos/checkdigit/preview/pulls/${PR_NUMBER_DEFAULT}/reviews`)
    .reply(200, () => [
      {
        id: '1234prReviewPull',
        user: {
          login: 'commituser1',
        },
        body: 'body string',
        state: 'COMMENTED',
        // eslint-disable-next-line camelcase
        submitted_at: new Date().toISOString(),
      },
      {
        id: '1234prReviewPull',
        user: {
          login: 'commituser3',
        },
        body: 'body string',
        state: 'COMMENTED',
        // eslint-disable-next-line camelcase
        submitted_at: new Date().toISOString(),
      },
      {
        id: '1234prReviewPull',
        user: {
          login: 'commituser3',
        },
        body: 'body string',
        state: 'APPROVED',
        // eslint-disable-next-line camelcase
        submitted_at: new Date().toISOString(),
      },
      {
        id: '1234prReviewPull',
        user: {
          login: 'commituser4',
        },
        body: 'body string',
        state: 'CHANGES_REQUESTED',
        // eslint-disable-next-line camelcase
        submitted_at: new Date().toISOString(),
      },
      {
        id: '1234prReviewPull',
        user: {
          login: 'commituser4',
        },
        body: 'body string',
        state: 'APPROVED',
        // eslint-disable-next-line camelcase
        submitted_at: new Date().toISOString(),
      },
    ]);

  nock('https://api.github.com/')
    .persist()
    .get(`/repos/checkdigit/previewOldReviews/pulls/${PR_NUMBER_DEFAULT}/reviews`)
    .reply(200, () => [
      {
        id: '1234prReviewPull',
        user: {
          login: 'commituser4',
        },
        body: 'body string',
        state: 'APPROVED',
        // eslint-disable-next-line camelcase
        submitted_at: new Date().toISOString(),
      },
      {
        id: '1234prReviewPull',
        user: {
          login: 'commituser5',
        },
        body: 'body string',
        state: 'CHANGES_REQUESTED',
        // eslint-disable-next-line camelcase
        submitted_at: '2023-09-03T01:03:30Z',
      },
      {
        id: '1234prReviewPull',
        user: {
          login: 'commituser5',
        },
        body: 'body string',
        state: 'APPROVED',
        // eslint-disable-next-line camelcase
        submitted_at: new Date().toISOString(),
      },
      {
        id: '1234prReviewPull',
        user: {
          login: 'commituser6',
        },
        body: 'body string',
        state: 'APPROVED',
        // eslint-disable-next-line camelcase
        submitted_at: '2023-10-01T01:03:30Z',
      },
    ]);

  nock('https://api.github.com/')
    .persist()
    .get(`/repos/checkdigit/preview/pulls/${PR_NUMBER_DEFAULT}`)
    .reply(200, () => ({
      head: {
        sha: '1234',
      },
      user: {
        login: 'commituser1',
      },
    }));

  nock('https://api.github.com/')
    .persist()
    .get(`/repos/checkdigit/previewOldReviews/pulls/${PR_NUMBER_DEFAULT}`)
    .reply(200, () => ({
      head: {
        sha: '1234',
      },
      user: {
        login: 'commituser1',
      },
    }));

  // return label
  nock('https://api.github.com/')
    .persist()
    .get(`/repos/checkdigit/testlabel/pulls/${PR_NUMBER_DEFAULT}`)
    .reply(200, () => ({
      labels: [{ name: 'patch' }],
    }));

  nock('https://api.github.com/')
    .persist()
    .get(`/repos/checkdigit/testlabel/pulls/${PR_NUMBER_MINOR}`)
    .reply(200, () => ({
      labels: [{ name: 'minor' }],
    }));

  nock('https://api.github.com/')
    .persist()
    .get(`/repos/checkdigit/testlabel/pulls/${PR_NUMBER_MAJOR}`)
    .reply(200, () => ({
      labels: [{ name: 'major' }],
    }));

  // return a raw package json file
  nock('https://api.github.com/')
    .get('/repos/checkdigit/testlabel/contents/package.json?ref=main')
    .reply(200, () => JSON.stringify({ version: options?.labelPackageVersionMain ?? '1.0.0' }));

  nock('https://api.github.com/')
    .get('/repos/checkdigit/testlabel/contents/package-lock.json?ref=main')
    .reply(200, () => JSON.stringify({ version: options?.labelPackageVersionMain ?? '1.0.0' }));

  // allow delete operations to the two comments that should be deleted
  nock('https://api.github.com/').persist().delete('/repos/checkdigit/comments/issues/comments/1').reply(200);
  nock('https://api.github.com/').persist().delete('/repos/checkdigit/comments/issues/comments/3').reply(200);

  nock('https://api.github.com/')
    .persist()
    .post(`/repos/checkdigit/comments/issues/${PR_NUMBER_DEFAULT}/comments`)
    .reply(200);
}
