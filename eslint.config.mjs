import tseslint from "typescript-eslint";
export default [
  {
    ignores: [
      "dist/**",
      "reports/**",
      "playwright-report/**",
      "public/**",
      "test-results/**",
    ],
  },
  ...tseslint.configs.recommended,
  {
    files: ["src/**/*.ts", "src/**/*.tsx"],
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_" },
      ],
    },
  },
];
