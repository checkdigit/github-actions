// validate-npm-package/validate-npm-package.spec.ts

import { strict as assert } from 'node:assert';
import { AsyncLocalStorage } from 'node:async_hooks';
import childProcess from 'node:child_process';
import { describe, it, mock } from 'node:test';
import { promisify } from 'node:util';

interface TestScope {
  betaPackage: string;
  injectedFailure: { commandIndex: number; error: Error } | undefined;
  executedCommandLines: string[];
}

// tests run concurrently, so mocks read per-test state from async context instead of shared mockImplementationOnce queues
describe('validate-npm-package', { concurrency: true }, async () => {
  const testScopeStorage = new AsyncLocalStorage<TestScope>();
  function getTestScope(): TestScope {
    const testScope = testScopeStorage.getStore();
    assert.ok(
      testScope,
      'verifyNpmPackage must be called via testScopeStorage.run',
    );
    return testScope;
  }

  mock.module('@actions/core', {
    exports: {
      getInput: (name: string) =>
        name === 'betaPackage' ? getTestScope().betaPackage : '',
      info: (message: string) => {
        // eslint-disable-next-line no-console
        console.log(message);
      },
    },
  });
  // production code promisifies exec, so the mock must expose promisify.custom to keep the { stdout, stderr } result
  const realExecAsync = promisify(childProcess.exec);
  mock.module('node:child_process', {
    exports: {
      default: {
        ...childProcess,
        exec: Object.assign(() => undefined, {
          [promisify.custom]: async (
            commandLine: string,
            options: childProcess.ExecOptions,
          ) => {
            const testScope = getTestScope();
            const commandIndex = testScope.executedCommandLines.length;
            testScope.executedCommandLines.push(commandLine);
            if (testScope.injectedFailure?.commandIndex === commandIndex) {
              throw testScope.injectedFailure.error;
            }
            return realExecAsync(commandLine, options);
          },
        }),
      },
    },
  });
  // must use dynamic import after mocking to ensure the mock is applied
  const { default: verifyNpmPackage } =
    await import('./validate-npm-package.ts');

  it(
    'successfully verify good npm package',
    { timeout: 60_000 },
    async (context) => {
      const testScope: TestScope = {
        betaPackage: '@checkdigit/ping@4.2.0',
        injectedFailure: undefined,
        executedCommandLines: [],
      };

      await testScopeStorage.run(testScope, () =>
        verifyNpmPackage(context.signal),
      );
    },
  );

  it(
    'successfully verify good beta npm package with the latest standards',
    { timeout: 60_000 },
    async (context) => {
      const testScope: TestScope = {
        betaPackage: '@checkdigit/ping@4.2.0-PR.44-dea4',
        injectedFailure: undefined,
        executedCommandLines: [],
      };

      await testScopeStorage.run(testScope, () =>
        verifyNpmPackage(context.signal),
      );
    },
  );

  it(
    'configuration only package that imports json directly should work',
    { timeout: 60_000 },
    async (context) => {
      const testScope: TestScope = {
        betaPackage: '@checkdigit/prettier-config@8.0.0',
        injectedFailure: undefined,
        executedCommandLines: [],
      };

      await testScopeStorage.run(testScope, () =>
        verifyNpmPackage(context.signal),
      );
    },
  );

  it(
    'service without serve-runtime should not have dependency conflicts',
    { timeout: 60_000 },
    async (context) => {
      const testScope: TestScope = {
        betaPackage: '@checkdigit/connector@4.0.2-PR.141-c066',
        injectedFailure: undefined,
        executedCommandLines: [],
      };

      await testScopeStorage.run(testScope, () =>
        verifyNpmPackage(context.signal),
      );
    },
  );

  it(
    'retries npm install after a failure',
    { timeout: 60_000 },
    async (context) => {
      const testScope: TestScope = {
        betaPackage: '@checkdigit/ping@4.2.0',
        injectedFailure: {
          commandIndex: 1,
          error: new Error('npm error code ECONNRESET'),
        },
        executedCommandLines: [],
      };

      await testScopeStorage.run(testScope, () =>
        verifyNpmPackage(context.signal),
      );

      assert.deepEqual(testScope.executedCommandLines, [
        'npm view @checkdigit/ping@4.2.0 --json',
        'npm i --ignore-scripts',
        'npm i --ignore-scripts',
        `node -e "import '@checkdigit/ping';"`,
      ]);
    },
  );

  it(
    'retries npm view after a failure',
    { timeout: 60_000 },
    async (context) => {
      const testScope: TestScope = {
        betaPackage: '@checkdigit/ping@4.2.0',
        injectedFailure: {
          commandIndex: 0,
          error: new Error('npm error code E404'),
        },
        executedCommandLines: [],
      };

      await testScopeStorage.run(testScope, () =>
        verifyNpmPackage(context.signal),
      );

      assert.deepEqual(testScope.executedCommandLines, [
        'npm view @checkdigit/ping@4.2.0 --json',
        'npm view @checkdigit/ping@4.2.0 --json',
        'npm i --ignore-scripts',
        `node -e "import '@checkdigit/ping';"`,
      ]);
    },
  );

  // Test uses a bad version of approval package
  // and requires skipLibCheck: false in tsconfig.json
  // we set it manually in validate npm package as
  // checkdigit/typescript-config is various versions of this setting
  it(
    'bad npm package results in error',
    { timeout: 60_000 },
    async (context) => {
      const testScope: TestScope = {
        betaPackage: '@checkdigit/approval@2.0.0-PR.196-b041',
        injectedFailure: undefined,
        executedCommandLines: [],
      };

      await assert.rejects(
        () =>
          testScopeStorage.run(testScope, () =>
            verifyNpmPackage(context.signal),
          ),
        Error,
      );
    },
  );
});
