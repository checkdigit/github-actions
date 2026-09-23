// check-label/check-label-swagger.spec.ts

/* eslint-disable @checkdigit/regular-expression-comment -- each expression matches a focused portion of a descriptive validation error */

import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';

import {
  type PackageJSON,
  resolveSwaggerPaths,
  validateSwaggerChange,
} from './check-label.ts';

const swaggerPath = 'src/api/v1/swagger.yml';

function packageJson(service?: PackageJSON['service']): PackageJSON {
  return {
    name: '@checkdigit/example',
    version: '1.0.1',
    files: [],
    ...(service === undefined ? {} : { service }),
  };
}

function swagger(version: string, suffix = ''): string {
  return `openapi: 3.0.0
info:
  title: Example API
  version: ${version}
paths: {}
${suffix}`;
}

describe('resolve Swagger paths', () => {
  it('returns no paths without a service API', () => {
    assert.deepEqual(resolveSwaggerPaths(packageJson()), []);
    assert.deepEqual(resolveSwaggerPaths(packageJson({})), []);
  });

  it('returns no paths for an empty endpoint list', () => {
    assert.deepEqual(
      resolveSwaggerPaths(packageJson({ api: { root: 'src', endpoints: [] } })),
      [],
    );
  });

  it('resolves one endpoint relative to the API root', () => {
    assert.deepEqual(
      resolveSwaggerPaths(
        packageJson({ api: { root: 'src', endpoints: ['api/v1'] } }),
      ),
      ['src/api/v1/swagger.yml'],
    );
  });

  it('resolves every endpoint relative to the API root', () => {
    assert.deepEqual(
      resolveSwaggerPaths(
        packageJson({
          api: { root: 'src', endpoints: ['api/v1', 'admin/v2'] },
        }),
      ),
      ['src/api/v1/swagger.yml', 'src/admin/v2/swagger.yml'],
    );
  });
});

describe('validate Swagger change', () => {
  it('does not require a bump when the Swagger is unchanged', () => {
    const unchanged = 'not even valid YAML';
    assert.doesNotThrow(() =>
      validateSwaggerChange(swaggerPath, unchanged, unchanged, 'patch'),
    );
  });

  it('requires a changed Swagger version to increase', () => {
    assert.throws(
      () =>
        validateSwaggerChange(
          swaggerPath,
          swagger('1.0.0', '# changed'),
          swagger('1.0.0'),
          'patch',
        ),
      /src\/api\/v1\/swagger\.yml: Swagger changed but branch info\.version 1\.0\.0 is not greater than main info\.version 1\.0\.0/u,
    );
    assert.throws(
      () =>
        validateSwaggerChange(
          swaggerPath,
          swagger('0.9.0', '# changed'),
          swagger('1.0.0'),
          'major',
        ),
      /branch info\.version 0\.9\.0 is not greater/u,
    );
  });

  [
    { main: '1.2.3', branch: '1.2.4', label: 'patch' },
    { main: '1.2.3', branch: '1.3.0', label: 'minor' },
    { main: '1.2.3', branch: '1.3.0', label: 'major' },
    { main: '1.2.3', branch: '2.0.0', label: 'major' },
  ].forEach(({ main, branch, label }) => {
    it(`accepts ${main} to ${branch} with a ${label} package bump`, () => {
      assert.doesNotThrow(() =>
        validateSwaggerChange(
          swaggerPath,
          swagger(`'${branch}'`, '# changed'),
          swagger(main),
          label,
        ),
      );
    });
  });

  it('allows patch Swagger bumps with larger package bumps', () => {
    assert.doesNotThrow(() =>
      validateSwaggerChange(
        swaggerPath,
        swagger('1.2.4', '# changed'),
        swagger('1.2.3'),
        'minor',
      ),
    );
    assert.doesNotThrow(() =>
      validateSwaggerChange(
        swaggerPath,
        swagger('1.2.4', '# changed again'),
        swagger('1.2.3'),
        'major',
      ),
    );
  });

  it('rejects package bumps below the Swagger bump severity', () => {
    assert.throws(
      () =>
        validateSwaggerChange(
          swaggerPath,
          swagger('1.3.0', '# changed'),
          swagger('1.2.3'),
          'patch',
        ),
      /minor Swagger version bump.*requires at least a minor.*received patch/u,
    );
    assert.throws(
      () =>
        validateSwaggerChange(
          swaggerPath,
          swagger('2.0.0', '# changed'),
          swagger('1.2.3'),
          'minor',
        ),
      /major Swagger version bump.*requires at least a major.*received minor/u,
    );
  });

  it('rejects missing info.version without matching unrelated version keys', () => {
    const missingInfoVersion = `openapi: 3.0.0
info:
  title: Example API
components:
  schemas:
    Widget:
      version: 9.9.9
`;
    assert.throws(
      () =>
        validateSwaggerChange(
          swaggerPath,
          missingInfoVersion,
          swagger('1.0.0'),
          'patch',
        ),
      /info\.version must be a non-empty string/u,
    );
  });

  it('supports flow mappings, anchors and aliases, and quoted keys', () => {
    const main = `openapi: 3.0.0
apiInfo: &apiInfo { title: Example API, "version": "1.2.3" }
"info": *apiInfo
paths: {}
`;
    const branch = main.replace('"1.2.3"', '"1.2.4"');
    assert.doesNotThrow(() =>
      validateSwaggerChange(swaggerPath, branch, main, 'patch'),
    );
  });

  it('rejects non-string info.version values', () => {
    assert.throws(
      () =>
        validateSwaggerChange(
          swaggerPath,
          'openapi: 3.0.0\ninfo: { version: 2 }\npaths: {}',
          swagger('1.0.0'),
          'major',
        ),
      /info\.version must be a non-empty string/u,
    );
  });

  it('rejects malformed branch and main versions with the affected path', () => {
    assert.throws(
      () =>
        validateSwaggerChange(
          swaggerPath,
          swagger('next', '# changed'),
          swagger('1.0.0'),
          'patch',
        ),
      /src\/api\/v1\/swagger\.yml: branch info\.version "next" is not valid semver/u,
    );
    assert.throws(
      () =>
        validateSwaggerChange(
          swaggerPath,
          swagger('1.0.1', '# changed'),
          swagger('old'),
          'patch',
        ),
      /src\/api\/v1\/swagger\.yml: main info\.version "old" is not valid semver/u,
    );
  });
});

/* eslint-enable @checkdigit/regular-expression-comment */
