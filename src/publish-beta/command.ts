// publish-beta/command.ts

import process from 'node:process';
import { debug } from 'debug';
import { getInput } from '@actions/core';

import { publishComment } from './github';
import { isPackageAnAPI, packageJSONUpdate } from './package';

const log = debug('action:command');
export default async function (): Promise<void | boolean> {
  const command = getInput('command').toLowerCase();
  log('Action starts:', command);

  if (command === 'publish-comment' && process.env['NEW_PACKAGE_VERSION']) {
    return publishComment(process.env['NEW_PACKAGE_VERSION']);
  }

  if (command === 'is-api') {
    return isPackageAnAPI(process.cwd());
  }

  if (command === 'generate-beta-version') {
    return packageJSONUpdate(process.cwd());
  }
  log('No valid command received: action-publish-beta [is-api | generate-beta-version | publish-comment]');
  throw new Error('no valid command');
}
