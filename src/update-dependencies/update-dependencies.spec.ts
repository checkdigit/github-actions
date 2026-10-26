// update-dependencies/update-dependencies.spec.ts

import { strict as assert } from 'node:assert';
import { describe, it, mock } from 'node:test';
import { promisify } from 'node:util';

const state: {
  manifest: {
    version: string;
    dependencies: { example: string } & Record<string, string>;
    devDependencies?: Record<string, string>;
    optionalDependencies?: Record<string, string>;
    peerDependencies?: Record<string, string>;
    scripts?: Record<string, string>;
  };
  hasLock: boolean;
  commands: string[];
  failure: string | undefined;
  isAuthorized: boolean;
  publications: unknown[][];
} = {
  manifest: { version: '1.2.3', dependencies: { example: '^1.0.0' } },
  hasLock: true,
  commands: [],
  failure: undefined,
  isAuthorized: true,
  publications: [],
};

mock.module('@actions/core', {
  exports: {
    startGroup: () => undefined,
    endGroup: () => undefined,
    getInput: () => '',
    info: () => undefined,
    setOutput: () => undefined,
  },
});
mock.module('@actions/github', {
  exports: { context: { eventName: 'issue_comment', payload: {} } },
});
mock.module('./client.ts', {
  exports: {
    getDependencyClient: () => ({}),
    getDependencyRepo: async () => ({ owner: 'checkdigit', repo: 'example' }),
  },
});
mock.module('./issue-command.ts', {
  exports: {
    authorizeComment: async () => (state.isAuthorized ? 10 : undefined),
  },
});
mock.module('./publish.ts', {
  exports: {
    assertUpdateBranchAvailable: async () => undefined,
    getDefaultBranch: async () => 'main',
    getExistingDependencyPR: async () => undefined,
    publishDependencyComment: async () => undefined,
    verifyDefaultBranch: async () => undefined,
    publishUpdate: async (...arguments_: unknown[]) => {
      state.publications.push(arguments_);
    },
  },
});
mock.module('node:fs/promises', {
  exports: {
    readFile: async (path: string) =>
      JSON.stringify(
        path === 'package.json'
          ? state.manifest
          : {
              version: state.manifest.version,
              packages: { '': { version: state.manifest.version } },
            },
      ),
    writeFile: async (_path: string, contents: string) => {
      state.manifest = JSON.parse(contents) as typeof state.manifest;
    },
    unlink: async () => {
      state.hasLock = false;
    },
  },
});
mock.module('node:child_process', {
  exports: {
    execFile: Object.assign(() => undefined, {
      [promisify.custom]: async (program: string, arguments_: string[]) => {
        const invocation = [program, ...arguments_].join(' ');
        state.commands.push(invocation);
        if (invocation === state.failure) {
          throw new Error('Command failed');
        }
        if (program === 'npx') {
          assert.equal(state.manifest.version, '1.2.4');
          for (const dependencies of [
            state.manifest.dependencies,
            state.manifest.devDependencies,
            state.manifest.optionalDependencies,
            state.manifest.peerDependencies,
          ]) {
            assert.equal(dependencies?.['rimraf'], undefined);
            assert.equal(dependencies?.['@types/koa__router'], undefined);
          }
          state.manifest.dependencies.example = '^3.0.0';
        }
        if (invocation === 'npm install --ignore-scripts') {
          assert.equal(state.hasLock, false);
          state.hasLock = true;
        }
        return {
          stderr: '',
          stdout:
            invocation === 'git rev-parse HEAD'
              ? 'base-sha'
              : arguments_[0] === 'ls-files'
                ? 'package.json\0package-lock.json\0src/fixed.ts\0new.ts\0removed.ts\0'
                : '',
        };
      },
    }),
  },
});
const { default: update } = await import('./update-dependencies.ts');

function reset() {
  state.manifest = { version: '1.2.3', dependencies: { example: '^1.0.0' } };
  state.hasLock = true;
  state.commands = [];
  state.publications.length = 0;
  state.failure = undefined;
  state.isAuthorized = true;
}

describe('dependency update execution', () => {
  it('sets standard Prettier commands when scripts differ, match, or are missing', async () => {
    for (const scripts of [
      undefined,
      { test: 'node --test' },
      {
        prettier: 'prettier src --check',
        'prettier:fix': 'prettier src --write',
        test: 'node --test',
      },
      {
        prettier: 'prettier . --check',
        'prettier:fix': 'prettier . --write',
        test: 'node --test',
      },
    ]) {
      reset();
      if (scripts !== undefined) {
        state.manifest.scripts = scripts;
      }
      await update();
      assert.deepEqual(state.manifest.scripts, {
        ...scripts,
        prettier: 'prettier . --check',
        'prettier:fix': 'prettier . --write',
      });
    }
  });

  it('removes obsolete Node flags from scripts and enables deprecation checks in ci:test', async () => {
    reset();
    state.manifest.scripts = {
      'ci:test':
        'node --disable-warning ExperimentalWarning --experimental-strip-types --test "src/**/*.spec.ts"',
      coverage:
        'node --experimental-strip-types --disable-warning=ExperimentalWarning --test --experimental-test-coverage',
      prepare:
        'node --disable-warning "ExperimentalWarning" setup.ts && node --experimental-strip-types other.ts',
      retained: 'node --disable-warning OtherWarning --test',
      quoted:
        'echo "--experimental-strip-types --disable-warning ExperimentalWarning"',
    };
    await update();
    assert.deepEqual(state.manifest.scripts, {
      'ci:test':
        'node --throw-deprecation --pending-deprecation --test "src/**/*.spec.ts"',
      coverage: 'node --test --experimental-test-coverage',
      prepare: 'node setup.ts && node other.ts',
      prettier: 'prettier . --check',
      'prettier:fix': 'prettier . --write',
      retained: 'node --disable-warning OtherWarning --test',
      quoted:
        'echo "--experimental-strip-types --disable-warning ExperimentalWarning"',
    });
  });

  it('adds only missing deprecation flags to each ci:test Node command', async () => {
    for (const flags of [
      '',
      '--throw-deprecation ',
      '--pending-deprecation ',
      '--throw-deprecation --pending-deprecation ',
    ]) {
      reset();
      state.manifest.scripts = {
        'ci:test': `npm run build && node ${flags}--test; node --test second.ts`,
        test: 'node --test',
      };
      await update();
      const script = state.manifest.scripts['ci:test'] ?? '';
      assert.equal(script.split('--throw-deprecation').length - 1, 2);
      assert.equal(script.split('--pending-deprecation').length - 1, 2);
      assert.ok(script.startsWith('npm run build && node '));
      assert.ok(
        script.endsWith(
          '; node --throw-deprecation --pending-deprecation --test second.ts',
        ),
      );
      assert.equal(state.manifest.scripts['test'], 'node --test');
    }
  });

  it('removes obsolete dependencies and migrates rimraf commands in every npm script', async () => {
    reset();
    for (const name of [
      'dependencies',
      'devDependencies',
      'optionalDependencies',
      'peerDependencies',
    ] as const) {
      state.manifest[name] ??= { example: '^1.0.0' };
      Object.assign(state.manifest[name], {
        rimraf: '^6.0.0',
        '@types/koa__router': '^12.0.0',
        retained: '^1.0.0',
      });
    }
    state.manifest.scripts = {
      clean: 'rimraf dist-mjs',
      build: 'rimraf "dist mjs" dist-cjs && tsc && rimraf temp',
      prepare: 'npx --yes rimraf cache; npx rimraf other',
      test: 'npm run build || rimraf failed',
      untouched: 'echo "rimraf dist && rimraf cache" && rimraf-helper dist',
      npx: 'npx tsc && npx --yes prettier --write .',
    };
    await update();
    const remove = `node -e "process.argv.slice(1).forEach((path) => require('node:fs').rmSync(path, { recursive: true, force: true }))" --`;
    assert.deepEqual(state.manifest.scripts, {
      clean: `${remove} dist-mjs`,
      prettier: 'prettier . --check',
      'prettier:fix': 'prettier . --write',
      build: `${remove} "dist mjs" dist-cjs && tsc && ${remove} temp`,
      prepare: `${remove} cache; ${remove} other`,
      test: `npm run build || ${remove} failed`,
      untouched: 'echo "rimraf dist && rimraf cache" && rimraf-helper dist',
      npx: 'npx tsc && npx --yes prettier --write .',
    });
    for (const dependencies of [
      state.manifest.dependencies,
      state.manifest.devDependencies,
      state.manifest.optionalDependencies,
      state.manifest.peerDependencies,
    ]) {
      assert.equal(dependencies?.['retained'], '^1.0.0');
    }
  });

  it('bumps the package patch, updates dependencies, fixes files, and tests before publishing', async () => {
    reset();
    await update();
    assert.deepEqual(state.commands, [
      'git status --porcelain',
      'git rev-parse HEAD',
      'npx --yes npm-check-updates -u',
      'npm install --ignore-scripts',
      'npm run prepare --if-present',
      'npm run prettier:fix',
      'npm run lint:fix',
      'npm run test',
      'git ls-files --modified --others --exclude-standard -z',
    ]);
    assert.equal(state.manifest.version, '1.2.4');
    assert.equal(state.manifest.dependencies.example, '^3.0.0');
    assert.equal(state.publications.length, 1);
    assert.deepEqual(state.publications[0]?.slice(4), [
      '1.2.4',
      [
        'package.json',
        'package-lock.json',
        'src/fixed.ts',
        'new.ts',
        'removed.ts',
      ],
      { issueNumber: 10, validationFailures: [] },
    ]);
  });

  it('publishes fixer and test failures for manual repair', async () => {
    for (const invocation of [
      'npm run prepare --if-present',
      'npm run prettier:fix',
      'npm run lint:fix',
      'npm run test',
    ]) {
      reset();
      state.failure = invocation;
      await update();
      assert.equal(state.publications.length, 1);
      assert.deepEqual(state.publications[0]?.at(-1), {
        issueNumber: 10,
        validationFailures: [invocation],
      });
      assert.ok(state.commands.includes('npm run test'));
      assert.ok(state.commands.includes('npm run prettier:fix'));
    }
  });

  it('does not publish when dependency updates or installation fail', async () => {
    for (const invocation of [
      'npx --yes npm-check-updates -u',
      'npm install --ignore-scripts',
    ]) {
      reset();
      state.failure = invocation;
      await assert.rejects(update(), /Command failed/u);
      assert.equal(state.publications.length, 0);
      assert.equal(state.commands.at(-1), invocation);
    }
  });

  it('does no package work for an unauthorized comment', async () => {
    reset();
    state.isAuthorized = false;
    await update();
    assert.deepEqual(state.commands, []);
    assert.equal(state.publications.length, 0);
  });
});
