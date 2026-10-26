// setup.ts

// eslint-disable-next-line unicorn/import-style
import util from 'node:util';
import childProcess from 'node:child_process';
import { fileURLToPath } from 'node:url';

const cwd = fileURLToPath(new URL('..', import.meta.url));
const exec = util.promisify(childProcess.exec);
await exec('npm ci', { cwd });
await exec('npm run build:dist-mjs', { cwd });
