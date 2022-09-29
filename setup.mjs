import util from 'node:util';
import childProcess from 'node:child_process';
import { URL } from 'node:url';
const __dirname = new URL('.', import.meta.url).pathname;
console.log('__dirname', __dirname);

console.log('CWD: ' + process.cwd());
const exec = util.promisify(childProcess.exec);
await exec('tsc');
