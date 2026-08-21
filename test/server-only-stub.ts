/**
 * Stands in for the `server-only` package under Vitest.
 *
 * That package deliberately throws when imported outside a React Server
 * Component — which is the point of it, and which also means every module in
 * `src/lib/repo/*` is unimportable from a plain Node test runner. Aliasing it
 * to nothing lets the integration tests reach the repositories without those
 * modules giving up the guarantee they carry in the real build.
 */
export {};
