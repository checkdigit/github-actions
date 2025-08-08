// eslint-disable-next-line unicorn/import-style
import util from 'node:util';
import childProcess from 'node:child_process';

const cwd = new URL('.', import.meta.url).pathname;
const exec = util.promisify(childProcess.exec);
await exec('npm ci', { cwd });
await exec('npm run build:dist-mjs', { cwd });
