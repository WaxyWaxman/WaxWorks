// Repository-level checks under tests/ — rows of a work order that no workspace
// member owns. Members run their own vitest; this one reads the tree.
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    environment: "node",
  },
});
