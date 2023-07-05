// check-published/slack.ts

import { strict as assert } from 'node:assert';
import debug from 'debug';

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

export default async function (serviceName: string, mainVersion: string, npmVersion: string): Promise<void> {
  const slackMessage: SlackMessage = {
    text: `*${serviceName} - missing publish*`,
    attachments: [
      {
        color: 'danger',
        text: `*Details* \n - version in main: *${mainVersion}* \n - npm version published: *${npmVersion}*`,
      },
    ],
  };

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
