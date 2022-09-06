// command.ts

import process from 'node:process';
import { debug } from 'debug';

import { publishComment } from './github';
import { isPackageAnAPI, packageJSONUpdate } from './package';

const log = debug('action:command');
export default async function (input: string[] | undefined): Promise<void | boolean> {
  const command = input?.[2];
  log('Action starts:', command);

  if (command === 'publishComment' && process.env['NEW_PACKAGE_VERSION']) {
    return publishComment(process.env['NEW_PACKAGE_VERSION']);
  }

  if (command === 'isAPI') {
    return isPackageAnAPI(process.cwd());
  }

  if (command === 'generateBetaVersion') {
    return packageJSONUpdate(process.cwd());
  }
  log('No valid command received: action-beta-publish [isAPI | generateBetaVersion]');
  throw new Error('no valid command');
}
