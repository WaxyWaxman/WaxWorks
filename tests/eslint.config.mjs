import tseslint from "typescript-eslint";

// These files assert the repository's own rules, including every security
// assertion the M0 review relied on. Until they became a workspace member
// nothing linted them (M0 finding 26).
export default tseslint.config(...tseslint.configs.recommended, {
  rules: {
    "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
    // A repository check reads the tree; `any` hides a shape the assertion should state.
    "@typescript-eslint/no-explicit-any": "error",
  },
});
