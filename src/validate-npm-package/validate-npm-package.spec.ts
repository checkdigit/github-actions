// validate-npm-package/validate-npm-package.spec.ts

import { strict as assert } from 'node:assert';
import childProcess from 'node:child_process';
import { describe, it, mock } from 'node:test';
import { promisify } from 'node:util';

describe('validate-npm-package', async () => {
  const getInputMock = mock.fn<(name: string) => string>();
  mock.module('@actions/core', {
    exports: {
      getInput: getInputMock,
    },
  });
  // production code promisifies exec, so the mock must expose promisify.custom to keep the { stdout, stderr } result
  const execAsyncMock = mock.fn<
    (
      command: string,
      options: childProcess.ExecOptions,
    ) => Promise<{ stdout: string; stderr: string }>
  >(promisify(childProcess.exec));
  mock.module('node:child_process', {
    exports: {
      default: {
        ...childProcess,
        exec: Object.assign(() => undefined, {
          [promisify.custom]: execAsyncMock,
        }),
      },
    },
  });
  // must use dynamic import after mocking to ensure the mock is applied
  const { default: verifyNpmPackage } =
    await import('./validate-npm-package.ts');

  it('successfully verify good npm package', { timeout: 300_000 }, async () => {
    getInputMock.mock.mockImplementationOnce((name: string) => {
      if (name === 'betaPackage') {
        return '@checkdigit/approval@2.0.3';
      }
      return '';
    });

    await verifyNpmPackage();
  });

  it(
    'successfully verify good beta npm package with the latest standards',
    { timeout: 300_000 },
    async () => {
      getInputMock.mock.mockImplementationOnce((name) => {
        if (name === 'betaPackage') {
          return '@checkdigit/test-checkdigit@3.4.1-PR.134-31bc';
        }
        return '';
      });

      await verifyNpmPackage();
    },
  );

  it(
    'configuration only package that imports json directly should work',
    { timeout: 300_000 },
    async () => {
      getInputMock.mock.mockImplementationOnce((name) => {
        if (name === 'betaPackage') {
          return '@checkdigit/prettier-config@8.0.0';
        }
        return '';
      });

      await verifyNpmPackage();
    },
  );

  it(
    'service without serve-runtime should not have dependency conflicts',
    { timeout: 300_000 },
    async () => {
      getInputMock.mock.mockImplementationOnce((name) => {
        if (name === 'betaPackage') {
          return '@checkdigit/connector@4.0.2-PR.141-c066';
        }
        return '';
      });

      await verifyNpmPackage();
    },
  );

  it('retries npm install after a failure', { timeout: 300_000 }, async () => {
    getInputMock.mock.mockImplementationOnce((name) => {
      if (name === 'betaPackage') {
        return '@checkdigit/prettier-config@8.0.0';
      }
      return '';
    });
    const firstCallIndex = execAsyncMock.mock.callCount();
    execAsyncMock.mock.mockImplementationOnce(async () => {
      throw new Error('npm error code ECONNRESET');
    }, firstCallIndex + 1);

    await verifyNpmPackage();

    assert.deepEqual(
      execAsyncMock.mock.calls
        .slice(firstCallIndex)
        .map((call) => call.arguments[0]),
      [
        'npm view @checkdigit/prettier-config@8.0.0 --json',
        'npm i --ignore-scripts',
        'npm i --ignore-scripts',
        `node -e "import '@checkdigit/prettier-config' with { type: 'json' };"`,
      ],
    );
  });

  it('retries npm view after a failure', { timeout: 300_000 }, async () => {
    getInputMock.mock.mockImplementationOnce((name) => {
      if (name === 'betaPackage') {
        return '@checkdigit/prettier-config@8.0.0';
      }
      return '';
    });
    const firstCallIndex = execAsyncMock.mock.callCount();
    execAsyncMock.mock.mockImplementationOnce(async () => {
      throw new Error('npm error code E404');
    }, firstCallIndex);

    await verifyNpmPackage();

    assert.deepEqual(
      execAsyncMock.mock.calls
        .slice(firstCallIndex)
        .map((call) => call.arguments[0]),
      [
        'npm view @checkdigit/prettier-config@8.0.0 --json',
        'npm view @checkdigit/prettier-config@8.0.0 --json',
        'npm i --ignore-scripts',
        `node -e "import '@checkdigit/prettier-config' with { type: 'json' };"`,
      ],
    );
  });

  // Test uses a bad version of approval package
  // and requires skipLibCheck: false in tsconfig.json
  // we set it manually in validate npm package as
  // checkdigit/typescript-config is various versions of this setting
  it('bad npm package results in error', { timeout: 300_000 }, async () => {
    getInputMock.mock.mockImplementationOnce((name) => {
      if (name === 'betaPackage') {
        return '@checkdigit/approval@2.0.0-PR.196-b041';
      }
      return '';
    });

    await assert.rejects(() => verifyNpmPackage(), Error);
  });
});
