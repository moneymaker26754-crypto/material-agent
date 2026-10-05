import { defineConfig } from 'vitest/config';
export default defineConfig({ test: { include: ['tests/**/*.test.ts'], exclude: ['tests/live/**'], testTimeout: 20000, pool: 'forks', maxWorkers: 2 } });
