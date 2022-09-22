// command.ts

import process from 'node:process';
import { debug } from 'debug';

import { publishComment } from './github';
import { isPackageAnAPI, packageJSONUpdate } from './package';

const log = debug('action:command');
export default async function (input: string[] | undefined): Promise<void | boolean> {
  const command = input?.[2];
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
  log('No valid command received: action-beta-publish [is-api | generate-beta-version | publish-comment]');
  throw new Error('no valid command');
}
