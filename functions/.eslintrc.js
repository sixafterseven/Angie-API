module.exports = {
  root: true,
  env: {
    es6: true,
    node: true,
  },
  extends: [
    "eslint:recommended",
    "google",
    "plugin:@typescript-eslint/recommended",
  ],
  parser: "@typescript-eslint/parser",
  parserOptions: {
    ecmaVersion: 2022,
    sourceType: "module",
  },
  plugins: ["@typescript-eslint", "import"],
  ignorePatterns: ["lib/**", "node_modules/**", ".eslintrc.js"],
  rules: {
    "require-jsdoc": "off",
    "valid-jsdoc": "off",
    "max-len": "off",
  },
};
