import { defineConfig, devices } from '@playwright/test';
import path from 'path';
import { config as loadEnv } from 'dotenv';

// Load local secrets for Playwright (SUPABASE_SERVICE_ROLE_KEY, E2E_ADMIN_*, etc.)
loadEnv({ path: path.resolve(__dirname, '.env.local') });
loadEnv({ path: path.resolve(__dirname, '.env') });

const baseURL =
  process.env.PW_BASE_URL ||
  process.env.STAGING_BASE_URL ||
  'https://mena-intel-desk.mores-cohorts9x.workers.dev';

export default defineConfig({
  testDir: './tests',
  timeout: 90_000,
  expect: { timeout: 15_000 },
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI
    ? [['github'], ['html', { outputFolder: 'playwright-report', open: 'never' }]]
    : [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});

