import { test, expect } from './fixtures/mock-api';

// The open-object dialog placeholder — distinct from the sidebar search inputs
const DIALOG_PLACEHOLDER = /type to search abap/i;

test.describe('Search', () => {
  test('Ctrl+P opens search dialog', async ({ page }) => {
    await page.goto('/');
    await page.waitForTimeout(500);
    await page.keyboard.press('ControlOrMeta+p');
    await expect(page.getByPlaceholder(DIALOG_PLACEHOLDER)).toBeVisible();
  });

  test('search returns results from API', async ({ page }) => {
    await page.goto('/');
    await page.waitForTimeout(500);
    await page.keyboard.press('ControlOrMeta+p');
    await page.getByPlaceholder(DIALOG_PLACEHOLDER).fill('ZTEST');

    await expect(page.getByText('ZTEST_PROGRAM')).toBeVisible({ timeout: 5000 });
    await expect(page.getByText('ZCL_TEST_CLASS')).toBeVisible();
  });

  test('clicking result opens object', async ({ page }) => {
    await page.goto('/');
    await page.waitForTimeout(500);
    await page.keyboard.press('ControlOrMeta+p');
    await page.getByPlaceholder(DIALOG_PLACEHOLDER).fill('ZTEST');
    await expect(page.getByText('ZTEST_PROGRAM')).toBeVisible({ timeout: 5000 });
    await page.getByText('ZTEST_PROGRAM').click();

    // Should see the object opened in a tab
    await expect(page.getByText('ZTEST_PROGRAM').first()).toBeVisible();
  });

  test('escape closes search dialog', async ({ page }) => {
    await page.goto('/');
    await page.waitForTimeout(500);
    await page.keyboard.press('ControlOrMeta+p');
    const input = page.getByPlaceholder(DIALOG_PLACEHOLDER);
    await expect(input).toBeVisible();
    // Ensure focus is on the dialog input before pressing Escape
    await input.focus();
    await page.keyboard.press('Escape');
    await expect(input).not.toBeVisible();
  });
});
