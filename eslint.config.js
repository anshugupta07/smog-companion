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
  curly: ["error", "all"],
  complexity: ["error", 8],
  "max-depth": ["error", 3],
  "max-params": ["error", 5],
  "max-lines-per-function": ["error", 50],
  "max-lines": ["error", 300],
  "no-magic-numbers": ["error", { ignore: [0, 1, -1], ignoreDefaultValues: true }],
  "no-nested-ternary": "error",
  "consistent-return": "error",
  "no-param-reassign": "error",
  "prefer-template": "error",
};

export default [
  { ignores: ["node_modules/**", "coverage/**"] },
  js.configs.recommended,
  {
    // Every function in shipped code is documented with typed parameters and return values.
    files: ["js/**/*.js", "lib/**/*.js", "server.js"],
    plugins: { jsdoc },
    rules: {
      "jsdoc/require-jsdoc": ["error", { publicOnly: false, require: { FunctionDeclaration: true } }],
      "jsdoc/require-param": "error",
      "jsdoc/require-param-type": "error",
      "jsdoc/check-param-names": "error",
      "jsdoc/require-returns": "error",
      "jsdoc/require-returns-type": "error",
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
    // Declarative data files hold many literals by design.
    files: ["js/data.js", "js/constants.js", "lib/config.js", "eslint.config.js"],
    rules: { "no-magic-numbers": "off", "max-lines-per-function": "off" },
  },
];
