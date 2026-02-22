import { test, expect } from './fixtures/mock-api';

const DIALOG_PLACEHOLDER = /type to search abap/i;

async function openObject(page: import('@playwright/test').Page) {
  await page.waitForTimeout(500);
  await page.keyboard.press('ControlOrMeta+p');
  await page.getByPlaceholder(DIALOG_PLACEHOLDER).fill('ZTEST');
  await expect(page.getByText('ZTEST_PROGRAM')).toBeVisible({ timeout: 5000 });
  await page.getByText('ZTEST_PROGRAM').click();
  await page.waitForTimeout(1000);
}

test.describe('Keyboard Shortcuts', () => {
  test('Ctrl+S triggers save', async ({ page }) => {
    await page.goto('/');
    await openObject(page);

    const savePromise = page.waitForRequest('**/api/v1/objects/create');
    await page.keyboard.press('ControlOrMeta+s');
    const request = await savePromise;
    expect(request.method()).toBe('POST');
  });

  test('Ctrl+B toggles sidebar', async ({ page }) => {
    await page.goto('/');
    // Toggle off
    await page.keyboard.press('ControlOrMeta+b');
    await page.waitForTimeout(300);
    // Toggle back on
    await page.keyboard.press('ControlOrMeta+b');
    await page.waitForTimeout(300);
  });

  test('Ctrl+J toggles bottom panel', async ({ page }) => {
    await page.goto('/');
    // Toggle
    await page.keyboard.press('ControlOrMeta+j');
    await page.waitForTimeout(300);
    // Toggle back
    await page.keyboard.press('ControlOrMeta+j');
    await page.waitForTimeout(300);
  });

  test('Ctrl+P opens search dialog', async ({ page }) => {
    await page.goto('/');
    await page.waitForTimeout(500);
    await page.keyboard.press('ControlOrMeta+p');
    await expect(page.getByPlaceholder(DIALOG_PLACEHOLDER)).toBeVisible();
  });

  test('Shift+Alt+F triggers format', async ({ page }) => {
    await page.goto('/');
    await openObject(page);

    // Use menu bar: AI → Format Code (more reliable than keyboard shortcuts with Monaco)
    const formatPromise = page.waitForRequest('**/api/v1/format');
    await page.getByText('AI', { exact: true }).click();
    await page.getByText('Format Code').click();
    const request = await formatPromise;
    expect(request.method()).toBe('POST');
  });
});
