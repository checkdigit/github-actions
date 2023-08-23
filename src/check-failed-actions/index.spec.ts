// check-failed-actions/index.spec.ts

import { strict as assert } from 'node:assert';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs/promises';
import http, { IncomingMessage, ServerResponse } from 'node:http';
import { v4 as uuid } from 'uuid';
import getPort from 'get-port';

import slackNock from './slack-nock.test';
import { main } from './index';

async function readRequestBody(request: IncomingMessage) {
  let body = '';
  for await (const chunk of request) {
    body += chunk;
  }
  return body;
}

describe('github', () => {
  const tmpFile = path.join(os.tmpdir(), uuid());
  let server: http.Server;
  let port: number;
  let lastRequest: string;

  beforeAll(async () => {
    await fs.writeFile(tmpFile, JSON.stringify({ foo: 'bar' }));

    port = await getPort();

    server = http
      // eslint-disable-next-line @typescript-eslint/no-misused-promises
      .createServer(async (request: IncomingMessage, response: ServerResponse) => {
        lastRequest = await readRequestBody(request);
        response.writeHead(200, { 'Content-Type': 'application/json' });
        response.end();
      })
      .listen(port, '::1');
  });

  afterAll(async () => {
    await fs.rm(tmpFile);
    server.close();
  });

  it('Error - slack notified', async () => {
    slackNock();

    process.env['GITHUB_EVENT_PATH'] = tmpFile;
    process.env['GITHUB_REPOSITORY'] = 'owner/repo';
    process.env['INPUT_FAILED'] = 'true';
    process.env['SLACK_FAILED_URL'] = `http://[::1]:${port}`;

    await main();
    assert.equal(lastRequest.includes('owner/repo'), true);
    assert.equal(lastRequest.includes('*owner/repo - action failure*'), true);
  });

  it('No error - slack not called', async () => {
    process.env['GITHUB_EVENT_PATH'] = tmpFile;
    process.env['GITHUB_REPOSITORY'] = 'owner/repo';
    process.env['INPUT_FAILED'] = 'false';

    await main();
    assert.ok(true);
  });
});
