// nocks/github.test.ts
import nock from 'nock';

export interface GithubNock {
  labelPackageVersionMain?: string;
}
export default function (options?: GithubNock): void {
  nock('https://api.github.com/').persist().get('/repos/checkdigit/nocomments/issues/10/comments').reply(200);
  nock('https://api.github.com/').persist().post('/repos/checkdigit/nocomments/issues/10/comments').reply(200);

  nock('https://api.github.com/')
    .persist()
    .get('/repos/checkdigit/comments/issues/10/comments')
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
    .get('/repos/checkdigit/preview/pulls/10/requested_reviewers')
    .reply(200, () => ({
      users: [],
    }));

  nock('https://api.github.com/')
    .persist()
    .get('/repos/checkdigit/previewOutstanding/pulls/10/requested_reviewers')
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
    .get('/repos/checkdigit/preview/pulls/10/reviews')
    .reply(200, () => [
      {
        id: '1234prReviewPull',
        user: {
          login: 'commituser1',
        },
        body: 'body string',
        state: 'COMMENTED',
      },
      {
        id: '1234prReviewPull',
        user: {
          login: 'commituser3',
        },
        body: 'body string',
        state: 'COMMENTED',
      },
      {
        id: '1234prReviewPull',
        user: {
          login: 'commituser3',
        },
        body: 'body string',
        state: 'APPROVED',
      },
      {
        id: '1234prReviewPull',
        user: {
          login: 'commituser4',
        },
        body: 'body string',
        state: 'CHANGES_REQUESTED',
      },
      {
        id: '1234prReviewPull',
        user: {
          login: 'commituser4',
        },
        body: 'body string',
        state: 'APPROVED',
      },
    ]);

  nock('https://api.github.com/')
    .persist()
    .get('/repos/checkdigit/preview/pulls/10')
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
    .get('/repos/checkdigit/testlabel/pulls/10')
    .reply(200, () => ({
      labels: [{ name: 'patch' }],
    }));

  nock('https://api.github.com/')
    .persist()
    .get('/repos/checkdigit/testlabel/pulls/11')
    .reply(200, () => ({
      labels: [{ name: 'major' }],
    }));

  // return a raw package json file
  nock('https://api.github.com/')
    .persist()
    .get('/repos/checkdigit/testlabel/contents/package.json?ref=main')
    .reply(200, () => {
      if (options?.labelPackageVersionMain) {
        return `{"version": "${options.labelPackageVersionMain}"}`;
      }
      return '{"version": "1.0.0"}';
    });

  nock('https://api.github.com/')
    .persist()
    .get('/repos/checkdigit/testlabel/contents/package-lock.json?ref=main')
    .reply(200, () => '{"version": "1.0.0"}');

  // allow delete operations to the two comments that should be deleted
  nock('https://api.github.com/').persist().delete('/repos/checkdigit/comments/issues/comments/1').reply(200);
  nock('https://api.github.com/').persist().delete('/repos/checkdigit/comments/issues/comments/3').reply(200);

  nock('https://api.github.com/').persist().post('/repos/checkdigit/comments/issues/10/comments').reply(200);
}
