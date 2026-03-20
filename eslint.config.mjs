import { defineConfig, globalIgnores } from "eslint/config";
import nextCoreWebVitals from "eslint-config-next/core-web-vitals";

export default defineConfig([
  ...nextCoreWebVitals,
  // Hooks 7 / React compiler rules are strict; relax until refactors (effects + Date.now in render).
  {
    rules: {
      "react-hooks/set-state-in-effect": "off",
      "react-hooks/purity": "off",
    },
  },
  globalIgnores([
    "**/.next/**",
    "**/out/**",
    "**/.open-next/**",
    "node_modules/**",
    "playwright-report/**",
    "test-results/**",
    "*.tsbuildinfo",
  ]),
]);
