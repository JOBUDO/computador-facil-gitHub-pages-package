import js from "@eslint/js";

export default [
  { ignores: ["dist/**", "node_modules/**", "supabase/functions/**/*.ts"] },
  js.configs.recommended,
  {
    files: ["site/**/*.js"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: {
        document: "readonly",
        window: "readonly",
        location: "readonly",
        history: "readonly",
        localStorage: "readonly",
        fetch: "readonly",
        URLSearchParams: "readonly",
        setTimeout: "readonly"
      }
    },
    rules: {
      "no-implied-eval": "error",
      "no-unsafe-optional-chaining": "error"
    }
  },
  {
    files: ["scripts/**/*.mjs"],
    languageOptions: { globals: { process: "readonly", URL: "readonly" } }
  },
  {
    files: ["supabase/functions/**/*.js"],
    languageOptions: { ecmaVersion: "latest", sourceType: "module" }
  },
  {
    files: ["tests/**/*.js"],
    languageOptions: { globals: { URL: "readonly", globalThis: "readonly", setImmediate: "readonly" } }
  }
];
