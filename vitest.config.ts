import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

/**
 * Unit tests only, in a Node environment. Nothing here touches a database or a
 * browser: `auction.ts` and `auction-engine.ts` are pure by design, which is
 * what makes the most consequential logic in the system testable in
 * milliseconds and without fixtures.
 */
export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    // `src/**/*.test.ts` also matches `*.integration.test.ts`. Those need a
    // database; `npm test` must stay runnable without one.
    exclude: ["**/node_modules/**", "src/**/*.integration.test.ts"],
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      /*
       * Needed here as well as in the integration config now that a unit test
       * imports a `server-only` module. env.ts and sms.ts carry the marker so
       * that importing them from a Client Component is a build error rather
       * than a secret in a JS bundle; under Vitest there is no bundler to give
       * it meaning, so it resolves to a stub. See test/server-only-stub.ts.
       */
      "server-only": fileURLToPath(
        new URL("./test/server-only-stub.ts", import.meta.url),
      ),
    },
  },
});
