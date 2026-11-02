import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    env: { ADMIN_KEY: 'test-admin-key', NODE_ENV: 'test', JWT_SECRET: 'test-secret-test-secret-test-secret-123' },
    include: ['test/**/*.test.ts'],
  },
});
