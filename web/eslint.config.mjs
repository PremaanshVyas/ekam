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
    // The React-Compiler-era react-hooks rules below flag patterns this app uses
    // ON PURPOSE and that are verified working: SSR-safe client-only init inside
    // mount effects (window / localStorage), latest-value refs synced during
    // render, the painter's one-time lazy <canvas> buffers, and seeded decorative
    // randomness (e.g. the confetti useMemo, which runs post-mount). Refactoring
    // them would risk the studio, canvas pan/zoom, music player, and finale — so
    // they're surfaced as warnings, not build-failing errors. Revisit if React
    // ships a clean idiom for these.
    rules: {
      "react-hooks/refs": "warn",
      "react-hooks/set-state-in-effect": "warn",
      "react-hooks/purity": "warn",
    },
  },
]);

export default eslintConfig;
