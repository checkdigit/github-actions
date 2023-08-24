// check-failed-actions/index.spec.ts

import { strict as assert } from 'node:assert';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs/promises';
import http from 'node:http';
import { v4 as uuid } from 'uuid';
import getPort from 'get-port';

import slackNock from './slack-nock.test';
import { main } from './index';

describe('github', () => {
  const tmpFile = path.join(os.tmpdir(), uuid());
  let server: http.Server;
  let port: number;
  let lastRequest: string;

  function setupServer() {
    return http
      .createServer((req, res) => {
        let requestBody = '';
        req.on('data', (chunk) => {
          requestBody += chunk;
        });
        req.on('end', () => {
          lastRequest = requestBody;
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ message: 'Request body received successfully' }));
        });
      })
      .listen(port, '::1');
  }

  beforeAll(async () => {
    await fs.writeFile(tmpFile, JSON.stringify({ foo: 'bar' }));
    port = await getPort();
    server = setupServer();
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
