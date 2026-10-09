// github-api/dependency-client.spec.ts

import { strict as assert } from 'node:assert';
import { it } from 'node:test';

import { getDependencyClient } from './dependency-client.ts';

it('requires GITHUB_TOKEN like existing GitHub API helpers', () => {
  const original = process.env['GITHUB_TOKEN'];
  try {
    process.env['GITHUB_TOKEN'] = '';
    assert.throws(() => getDependencyClient(), {
      message: 'incorrect action configuration: GITHUB_TOKEN is not set',
    });
  } finally {
    if (original === undefined) {
      delete process.env['GITHUB_TOKEN'];
    } else {
      process.env['GITHUB_TOKEN'] = original;
    }
  }
});
