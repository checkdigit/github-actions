// publish-beta/short-id.spec.ts

import { strict as assert } from 'node:assert';
import shortId from './short-id';

describe('shortid', () => {
  it('Length and multiple calls', async () => {
    const id1 = shortId();
    assert.equal(id1.length, 5);
    const id2 = shortId();
    assert.notEqual(id1, id2);
  });
});
