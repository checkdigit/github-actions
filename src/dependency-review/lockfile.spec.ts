// dependency-review/lockfile.spec.ts

import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';

import { diffDependencies } from './diff.ts';
import { npmPurl, parsePackageLock } from './lockfile.ts';

describe('npm package-lock parsing and diffing', () => {
  it('parses workspaces, duplicate nested versions, scope, optional, and licenses', () => {
    const dependencies = parsePackageLock(
      JSON.stringify({
        lockfileVersion: 3,
        packages: {
          '': { name: 'root', version: '1.0.0' },
          'packages/workspace': {
            name: '@example/workspace',
            version: '1.0.0',
          },
          'node_modules/@example/workspace': {
            resolved: 'packages/workspace',
            link: true,
          },
          'node_modules/foo': {
            version: '2.0.0',
            optional: true,
            license: 'MIT',
            resolved: 'https://registry.npmjs.org/foo/-/foo-2.0.0.tgz',
          },
          'node_modules/parent/node_modules/foo': {
            version: '1.0.0',
            dev: true,
          },
          'node_modules/@scope/package': {
            version: '3.0.0',
            devOptional: true,
          },
          'node_modules/remote-package': {
            version: '1.0.0',
            resolved: 'https://example.com/remote-package.tgz',
          },
          'node_modules/omitted-peer': {
            optional: true,
            peer: true,
          },
        },
      }),
      'apps/web/package-lock.json',
    );

    assert.deepEqual(
      dependencies.map(({ name, version, scope, optional, license }) => ({
        name,
        version,
        scope,
        optional,
        license,
      })),
      [
        {
          name: '@scope/package',
          version: '3.0.0',
          scope: 'runtime',
          optional: false,
          license: undefined,
        },
        {
          name: 'foo',
          version: '2.0.0',
          scope: 'runtime',
          optional: true,
          license: 'MIT',
        },
        {
          name: 'foo',
          version: '1.0.0',
          scope: 'development',
          optional: false,
          license: undefined,
        },
        {
          name: 'remote-package',
          version: '1.0.0',
          scope: 'runtime',
          optional: false,
          license: undefined,
        },
      ],
    );
    assert.equal(
      dependencies.find(({ name }) => name === 'remote-package')?.source,
      'remote',
    );
    assert.equal(
      dependencies.find(
        ({ name, version }) => name === 'foo' && version === '2.0.0',
      )?.source,
      'npm',
    );
    assert.equal(
      npmPurl('@scope/package', '3.0.0'),
      'pkg:npm/%40scope/package@3.0.0',
    );
  });

  it('reports version changes, additions, and removals per install path', () => {
    const base = parsePackageLock(
      JSON.stringify({
        lockfileVersion: 2,
        packages: {
          '': {},
          'node_modules/a': { version: '1.0.0' },
          'node_modules/removed': { version: '1.0.0' },
        },
      }),
      'package-lock.json',
    );
    const head = parsePackageLock(
      JSON.stringify({
        lockfileVersion: 3,
        packages: {
          '': {},
          'node_modules/a': { version: '2.0.0' },
          'node_modules/added': { version: '1.0.0' },
        },
      }),
      'package-lock.json',
    );
    const changes = diffDependencies(base, head);

    assert.deepEqual(
      changes.map(({ name, changeType, previousVersion }) => ({
        name,
        changeType,
        previousVersion,
      })),
      [
        { name: 'added', changeType: 'added', previousVersion: undefined },
        { name: 'a', changeType: 'changed', previousVersion: '1.0.0' },
        { name: 'removed', changeType: 'removed', previousVersion: undefined },
      ],
    );

    const headDependency = head[0];
    assert.ok(headDependency);
    const registry = {
      ...headDependency,
      source: 'npm' as const,
      resolved: 'https://registry.npmjs.org/a/-/a-2.0.0.tgz',
    };
    const git = {
      ...registry,
      source: 'git' as const,
      resolved: 'git+https://github.com/example/a.git',
    };
    assert.equal(diffDependencies([registry], [git])[0]?.changeType, 'changed');
  });

  it('fails closed for unsupported or malformed lockfiles', () => {
    assert.throws(
      () => parsePackageLock('{', 'package-lock.json'),
      /Invalid JSON/u,
    );
    assert.throws(
      () =>
        parsePackageLock(
          JSON.stringify({ lockfileVersion: 1, packages: {} }),
          'package-lock.json',
        ),
      /unsupported lockfileVersion/u,
    );
  });
});
