import util from 'node:util';
import childProcess from 'node:child_process';
import { URL } from 'node:url';

const cwd = new URL('.', import.meta.url).pathname;
const exec = util.promisify(childProcess.exec);
await exec('npm ci', {cwd});
await exec('tsc', {cwd});
