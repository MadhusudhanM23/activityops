import { defineConfig } from 'vitest/config';

/**
 * Several suites build the whole app (database, routes, security hooks) before each test. On a cold
 * start, with sixteen workers spawning at once on a small machine, that can pass Vitest's default
 * 5 s limit even though nothing is wrong: on 2026-10-19 the first run after idle timed out three
 * tests at ~5.3-5.9 s, and two immediate re-runs passed all 273. The limit is raised so the suite
 * reports real failures, not slow starts.
 */
export default defineConfig({
  test: {
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
