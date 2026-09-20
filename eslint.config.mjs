import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // One-off Node diagnostics use CommonJS and dynamically shaped query results.
  // Keep application code strict; these scripts are not bundled into the app.
  {
    files: ["scripts/**/*.js", "scripts/**/*.ts", "echo_query.ts", "verify_quotas.ts"],
    rules: { "@typescript-eslint/no-explicit-any": "off", "@typescript-eslint/no-require-imports": "off" },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    ".next-review/**",
    ".test-artifacts/**",
    "scripts/diagnostics/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
