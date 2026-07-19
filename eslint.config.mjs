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
    // Untracked throwaway probes (gitignored); never lint them.
    "scratch/**",
    // Claude Design handoff bundle (gitignored); a prototype, not app source.
    "annotations-panel-design/**",
    // Agent-generated design-sync tooling: separate sub-packages with their
    // own toolchains, not part of the app's lint scope.
    ".design-sync/**",
    ".ds-sync/**",
    "ds-bundle/**",
  ]),
]);

export default eslintConfig;
