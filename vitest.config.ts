import { defineConfig } from 'vitest/config';
export default defineConfig({test:{include:['tests/**/*.test.ts'],exclude:process.env.AI_SEARCH_LIVE?[]:['tests/live/**'],testTimeout:process.env.AI_SEARCH_LIVE?30000:5000}});
