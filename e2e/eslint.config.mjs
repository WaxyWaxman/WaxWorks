import tseslint from "typescript-eslint";

// A-102's per-member lint. The specs themselves are QA's and land with the
// first /qa automate; the config and fixtures are linted from M0 (A-85).
export default tseslint.config(...tseslint.configs.recommended, {
  rules: {
    "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
  },
});
