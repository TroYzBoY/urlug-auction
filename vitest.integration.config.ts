import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

/**
 * Integration tests — separate from `vitest.config.ts` because they need a
 * database and the unit tests must stay runnable without one. `npm test` is
 * the fast, dependency-free suite; `npm run test:db` is this.
 */
export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.integration.test.ts"],
    /*
     * One file at a time. These share a database and TRUNCATE it between
     * tests; running files in parallel would have them clearing each other's
     * fixtures mid-assertion.
     */
    fileParallelism: false,
    // The concurrency tests deliberately queue behind a row lock.
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      // See test/server-only-stub.ts.
      "server-only": fileURLToPath(
        new URL("./test/server-only-stub.ts", import.meta.url),
      ),
    },
  },
});
