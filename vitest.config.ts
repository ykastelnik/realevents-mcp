import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: false,
    include: ["tests/**/*.test.ts"],
    environment: "node",
    coverage: {
      provider: "v8",
      reporter: ["text", "html", "lcov"],
      include: ["src/**/*.ts"],
      exclude: ["src/**/*.test.ts", "src/types.ts", "src/index.ts"],
      thresholds: {
        lines: 85,
        functions: 85,
        branches: 80,
        statements: 85,
        "src/lib/**": {
          lines: 90,
          functions: 90,
          branches: 85,
          statements: 90
        },
        "src/tools/**": {
          lines: 80,
          functions: 80,
          branches: 80,
          statements: 80
        }
      }
    }
  }
});
