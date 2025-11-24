import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: 'tests',
  timeout: 30_000,
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    trace: 'on-first-retry',
    headless: true,
  },
  projects: [
    {
      name: 'msedge',
      use: { ...devices['Desktop Edge'] },
    },
  ],
});
