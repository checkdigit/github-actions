// check-failed-actions/slack-nock.test.ts

import nock from 'nock';

export default function (): void {
  nock('https://slack.local').persist().post('/').reply(200);
}
