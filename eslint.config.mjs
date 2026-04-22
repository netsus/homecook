import { dirname } from "path";
import { fileURLToPath } from "url";
import { FlatCompat } from "@eslint/eslintrc";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
});

const eslintConfig = [
  {
    ignores: [
      "node_modules/**",
      ".next/**",
      "**/.next/**",
      ".worktrees/**",
      "**/.worktrees/**",
      ".agents/**",
      "**/.agents/**",
      ".artifacts/**",
      "**/.artifacts/**",
      "out/**",
      "build/**",
      "coverage/**",
      "playwright-report/**",
      "**/playwright-report/**",
      "test-results/**",
      "**/test-results/**",
      "next-env.d.ts",
      "**/next-env.d.ts",
    ],
  },
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  {
    linterOptions: {
      reportUnusedDisableDirectives: "error",
    },
  },
  {
    rules: {
      "no-debugger": "error",
      "no-alert": "error",
      "no-console": ["warn", { allow: ["warn", "error"] }],
      eqeqeq: ["error", "always"],
    },
  },
];

export default eslintConfig;
