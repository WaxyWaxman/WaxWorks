import tseslint from "typescript-eslint";

export default tseslint.config(...tseslint.configs.recommended, {
  rules: {
    // Stubs carry their schemas as parameters so the signature is typed before the body exists (A-99).
    "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
    // A wrapper never reads the environment (A-98). Lint is the second line; tests/contracts.test.ts is the first.
    "no-restricted-properties": ["error", { object: "process", property: "env", message: "A-98: no wrapper reads process.env; choose the client at the composition root." }],
  },
});
