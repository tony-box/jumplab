import { createRequire, registerHooks } from "node:module";
import { pathToFileURL } from "node:url";
import reactHooks from "eslint-plugin-react-hooks";

// The repo compiles with TypeScript 7, which has no JS compiler API. typescript-eslint needs
// TypeScript <6.1, installed in this workspace. npm hoists the peer-only ts-api-utils next to
// TypeScript 7, so route its "typescript" import to the local copy for the lint process only.
const localTypescript = pathToFileURL(createRequire(import.meta.url).resolve("typescript")).href;
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "typescript" && context.parentURL?.includes("/node_modules/ts-api-utils/")) {
      return { url: localTypescript, format: "commonjs", shortCircuit: true };
    }
    return nextResolve(specifier, context);
  }
});

const { default: tseslint } = await import("typescript-eslint");

const tsFiles = ["**/*.{ts,tsx,mts,cts}"];

/** TypeScript and React hook rules; the root eslint.config.js composes these. */
export const typescriptConfigs = [
  ...tseslint.configs.recommended.map((config) => ({ ...config, files: tsFiles })),
  {
    files: tsFiles,
    plugins: { "react-hooks": reactHooks },
    rules: {
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrorsIgnorePattern: "^_" }
      ]
    }
  }
];
