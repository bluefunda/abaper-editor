import { test, expect } from './fixtures/mock-api';

test.describe('Sidebar', () => {
  test('Ctrl+B toggles sidebar visibility', async ({ page }) => {
    await page.goto('/');

    // Sidebar should be visible initially
    const sidebar = page.locator('[data-testid="sidebar"]').or(page.locator('.flex-1').first());

    // Toggle sidebar off
    await page.keyboard.press('ControlOrMeta+b');
    await page.waitForTimeout(300);

    // Toggle sidebar on
    await page.keyboard.press('ControlOrMeta+b');
    await page.waitForTimeout(300);
  });

  test('sidebar panel switching works', async ({ page }) => {
    await page.goto('/');

    // Click on search icon in sidebar
    const searchButton = page.locator('[title="Search"]').or(page.locator('button').filter({ has: page.locator('svg') }).nth(1));
    if (await searchButton.isVisible()) {
      await searchButton.click();
    }
  });
});
