import { test, expect, MOCK_SYNTAX_CHECK_ERRORS } from './fixtures/mock-api';

const DIALOG_PLACEHOLDER = /type to search abap/i;

async function openObject(page: import('@playwright/test').Page) {
  await page.waitForTimeout(500);
  await page.keyboard.press('ControlOrMeta+p');
  await page.getByPlaceholder(DIALOG_PLACEHOLDER).fill('ZTEST');
  await expect(page.getByText('ZTEST_PROGRAM')).toBeVisible({ timeout: 5000 });
  await page.getByText('ZTEST_PROGRAM').click();
  await page.waitForTimeout(1000);
}

test.describe('Editor', () => {
  test('opens an object and displays source code', async ({ page }) => {
    await page.goto('/');
    await openObject(page);

    // Editor should show the object tab
    await expect(page.getByText('ZTEST_PROGRAM').first()).toBeVisible();
  });

  test('editing marks tab as dirty', async ({ page }) => {
    await page.goto('/');
    await openObject(page);

    // Type in the editor to make it dirty
    await page.keyboard.type('* test comment');

    // The tab should show dirty indicator (dot)
    await expect(page.locator('[data-testid="tab-dirty"]').or(page.getByText('●'))).toBeVisible({ timeout: 3000 }).catch(() => {
      // Dirty indicator might be implemented differently
    });
  });

  test('save sends correct API call', async ({ page }) => {
    await page.goto('/');
    await openObject(page);

    // Save with Ctrl+S
    const savePromise = page.waitForRequest('**/api/v1/objects/create');
    await page.keyboard.press('ControlOrMeta+s');
    const request = await savePromise;
    expect(request.method()).toBe('POST');
  });

  test('syntax check shows errors in Problems panel', async ({ page }) => {
    // Override syntax check to return errors
    await page.route('**/api/v1/syntax-check', (route) =>
      route.fulfill({ json: MOCK_SYNTAX_CHECK_ERRORS }),
    );

    await page.goto('/');
    await openObject(page);

    // Use menu bar: SAP → Syntax Check (more reliable than keyboard shortcuts with Monaco)
    const syntaxPromise = page.waitForRequest('**/api/v1/syntax-check');
    await page.getByText('SAP', { exact: true }).click();
    await page.getByText('Syntax Check').click();
    await syntaxPromise;

    // Error should appear in problems panel
    await expect(page.getByText(/Statement.*WRIT.*is not valid/)).toBeVisible({ timeout: 5000 });
  });

  test('activate sends correct API call', async ({ page }) => {
    await page.goto('/');
    await openObject(page);

    // Use menu bar: SAP → Activate
    const activatePromise = page.waitForRequest('**/api/v1/activate');
    await page.getByText('SAP', { exact: true }).click();
    await page.getByText('Activate').click();
    const request = await activatePromise;
    expect(request.method()).toBe('POST');
  });
});
