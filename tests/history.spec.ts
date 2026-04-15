import { test, expect } from '@playwright/test';

// Smoke tests for History page
// Requires playwright.config.ts to start vite with
// VITE_E2E_BYPASS_AUTH=true and VITE_E2E_MOCK_HISTORY=true

test.describe('Playwright smoke test', () => {
  test('can access google.com', async ({ page }) => {
    // Teste simples para verificar se Playwright está funcionando
    await page.goto('https://google.com');
    await expect(page).toHaveTitle(/Google/);
  });
});
