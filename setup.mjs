import util from 'node:util';
import childProcess from 'node:child_process';

console.log('CWD: ' + process.cwd());
const exec = util.promisify(childProcess.exec);
await exec('tsc');
