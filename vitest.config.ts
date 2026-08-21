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
    },
  },
});
