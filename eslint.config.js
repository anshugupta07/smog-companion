import js from "@eslint/js";
import globals from "globals";
import jsdoc from "eslint-plugin-jsdoc";

const qualityRules = {
  eqeqeq: ["error", "always", { null: "ignore" }],
  "no-var": "error",
  "prefer-const": "error",
  "no-shadow": "error",
  "no-unused-vars": ["error", { args: "after-used", ignoreRestSiblings: true }],
  "no-implicit-coercion": ["error", { allow: ["!!"] }],
  "no-throw-literal": "error",
  "no-return-await": "error",
  curly: ["error", "multi-line"],
  complexity: ["error", 8],
  "max-depth": ["error", 3],
  "max-params": ["error", 5],
  "max-lines-per-function": ["error", 50],
  "max-lines": ["error", 300],
  "no-magic-numbers": [
    "error",
    {
      ignore: [0, 1, -1, 10, 60, 1000],
      ignoreDefaultValues: true,
    },
  ],
  "no-nested-ternary": "error",
  "consistent-return": "error",
  "no-param-reassign": "error",
  "prefer-template": "error",
};

export default [
  { ignores: ["node_modules/**", "coverage/**"] },
  js.configs.recommended,
  {
    plugins: { jsdoc },
    rules: {
      "jsdoc/require-jsdoc": [
        "error",
        {
          publicOnly: true,
          require: { FunctionDeclaration: true },
        },
      ],
    },
  },
  { rules: qualityRules },
  {
    files: ["js/**/*.js"],
    languageOptions: { sourceType: "module", globals: { ...globals.browser } },
  },
  {
    files: ["server.js", "lib/**/*.js", "eslint.config.js", "tests/**/*.js"],
    languageOptions: { sourceType: "module", globals: globals.node },
  },
  {
    files: ["tests/**/*.js"],
    rules: {
      "no-magic-numbers": "off",
      "max-lines-per-function": "off",
      "max-lines": "off",
    },
  },
  {
    files: ["js/data.js", "eslint.config.js", "server.js", "lib/**/*.js"],
    rules: {
      "no-magic-numbers": "off",
      "max-lines-per-function": "off",
      complexity: ["error", 12],
    },
  },
  {
    files: ["js/features/**/*.js"],
    rules: {},
  },
];
