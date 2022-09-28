import util from 'node:util';
import childProcess from 'node:child_process';

const exec = util.promisify(childProcess.exec);
await exec('tsc');
