import { defineConfig, devices } from '@playwright/test'

/**
 * Playwright config for the experiment home UI smoke tests.
 *
 * These specs require the experiment flag and a running dev server:
 *   npm run env:branch   # sets NEXT_PUBLIC_EXPERIMENT_HOME_UI=true
 *   npm run dev          # http://localhost:3000
 *   npm run test:e2e
 *
 * Specs self-skip when NEXT_PUBLIC_EXPERIMENT_HOME_UI !== 'true', so the
 * suite is a no-op in CI / on main unless the flag is provided.
 */
const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:3000'

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: 'list',
  use: {
    baseURL,
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'desktop',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } },
    },
    {
      name: 'mobile',
      use: { ...devices['Pixel 5'] },
    },
  ],
})
