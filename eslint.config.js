import { typescriptConfigs } from "@bike-jumper/eslint-config";
import js from "@eslint/js";

export default [
  {
    ignores: [
      "**/node_modules/**",
      "**/dist/**",
      "**/dev-dist/**",
      "**/coverage/**",
      "**/playwright-report/**",
      "**/test-results/**",
      "**/.vite/**",
      "**/*.d.ts",
      "crates/**/target/**",
      "crates/physics-core/pkg/**",
      "crates/physics-core/pkg-benchmark-node/**",
      "crates/physics-core/pkg-node/**",
      "apps/web/public/physics/**"
    ]
  },
  js.configs.recommended,
  ...typescriptConfigs,
  {
    files: ["**/*.{js,mjs,cjs}"],
    languageOptions: {
      globals: {
        console: "readonly",
        process: "readonly",
        fetch: "readonly",
        navigator: "readonly",
        setTimeout: "readonly",
        window: "readonly"
      }
    },
    rules: {
      "no-var": "error",
      "prefer-const": "error",
      "no-console": "off"
    }
  },
  {
    files: ["scripts/run-interaction-benchmark.mjs"],
    languageOptions: {
      globals: {
        document: "readonly",
        Event: "readonly",
        HTMLButtonElement: "readonly",
        HTMLInputElement: "readonly",
        requestAnimationFrame: "readonly"
      }
    }
  }
];
