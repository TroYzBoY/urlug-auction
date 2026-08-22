import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),

  {
    /*
     * k6 scripts. The runner calls the default export once per virtual user, so
     * an anonymous default IS the contract — the rule exists to stop React
     * components losing their displayName, which does not apply here. k6 also
     * provides `__ENV`, `__VU` and `__ITER` as globals.
     */
    files: ["load/**/*.js"],
    languageOptions: {
      globals: { __ENV: "readonly", __VU: "readonly", __ITER: "readonly" },
    },
    rules: {
      "import/no-anonymous-default-export": "off",
    },
  },
]);

export default eslintConfig;
