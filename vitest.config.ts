import { defineConfig, defineProject } from "vitest/config";

export default defineConfig({
  test: {
    passWithNoTests: true,
    projects: [
      defineProject({
        test: {
          name: "web-unit",
          include: [
            "apps/web/src/**/*.test.{ts,tsx}",
            "apps/web/tests/**/*.test.{ts,tsx}",
            "apps/web/tests/**/*.spec.{ts,tsx}"
          ],
          environment: "jsdom"
        }
      }),
      defineProject({
        test: {
          name: "schema-unit",
          include: ["packages/schema/tests/**/*.test.ts"],
          environment: "node"
        }
      }),
      defineProject({
        test: {
          name: "contracts",
          include: ["tests/contracts/**/*.test.ts"],
          environment: "node"
        }
      }),
      defineProject({
        test: {
          name: "parity",
          include: ["tests/parity/**/*.spec.ts"],
          environment: "node"
        }
      }),
      defineProject({
        test: {
          name: "benchmarks",
          include: ["tests/benchmarks/**/*.bench.ts"],
          environment: "node"
        }
      })
    ]
  }
});
