// perform-bundle/deployer.ts

import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import debug from 'debug';

const execAsync = promisify(exec);

const log = debug('github-actions:perform-bundle:deployer');

export default async function (): Promise<void> {
  log('Install deployer');
  await execAsync('npm install @checkdigit/deployer');
  log('Install deployer complete');
  log('Execute deployer');
  await execAsync('export AWS_REGION=us-east-1 && npx deploy stage:lambda');
  log('Execute deployer complete');
}
