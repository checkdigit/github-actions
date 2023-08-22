// check-failed-actions/slack.ts

import { strict as assert } from 'node:assert';
import debug from 'debug';
import { fetch } from 'undici';

const log = debug('check-published:slack');

export interface SlackMessage {
  text: string;
  attachments: [
    {
      color: string;
      text: string;
    }
  ];
}

async function postSlackMessage(slackMessage: SlackMessage): Promise<void> {
  try {
    const slackUrl = process.env['SLACK_PUBLISH_MISMATCH'];
    assert(slackUrl);
    log('slack HTTP POST request options: ', JSON.stringify(slackMessage));
    await fetch(slackUrl, {
      method: 'POST',
      body: JSON.stringify(slackMessage),
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (slackPostError) {
    log(`slack HTTP POST Error: ${String(slackPostError)}`);
    throw new Error(`slack HTTP POST Error: ${String(slackPostError)}`);
  }
}

export default async function (repoName: string): Promise<void> {
  const slackMessage: SlackMessage = {
    text: `*${repoName} - action failure*`,
    attachments: [
      {
        color: 'danger',
        text: `*Details* \n - Action in ${repoName} / main has failed*`,
      },
    ],
  };
  await postSlackMessage(slackMessage);
}
