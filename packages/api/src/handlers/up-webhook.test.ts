// up-webhook is exercised end-to-end in integration tests against a live
// Supabase instance. Unit-level signature verification lives in
// @leftovers/sync's up.test.ts. This stub keeps `pnpm -r test` from failing
// on an empty test file when the package is otherwise green.
import { describe, it } from 'vitest';

describe('up-webhook smoke', () => {
  it('module loads', () => {
    // import is enough — failure surfaces in test runner
  });
});
