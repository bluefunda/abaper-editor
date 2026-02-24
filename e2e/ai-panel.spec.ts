import { test, expect } from './fixtures/mock-api';

async function openRightPanel(page: import('@playwright/test').Page) {
  const aiButton = page.locator('[title="AI Assistant (Ctrl+L)"]');
  await aiButton.click();
  await expect(page.getByText('AI Assistant')).toBeVisible({ timeout: 5000 });
}

async function openObject(page: import('@playwright/test').Page) {
  // Ensure page is fully loaded before sending keyboard shortcut
  await page.waitForTimeout(500);
  await page.keyboard.press('ControlOrMeta+p');
  const input = page.getByPlaceholder(/type to search/i);
  await expect(input).toBeVisible();
  await input.fill('ZTEST');
  // Wait for debounce (200ms) + API response
  await expect(page.getByText('ZTEST_PROGRAM')).toBeVisible({ timeout: 5000 });
  await page.getByText('ZTEST_PROGRAM').click();
  await page.waitForTimeout(500);
}

test.describe('AI Panel', () => {
  test('shows ABAPer agent status indicator', async ({ page }) => {
    await page.goto('/');
    await openRightPanel(page);
    await expect(page.getByText(/ABAPer agent:/).first()).toBeVisible({ timeout: 5000 });
  });

  test('shows quick action buttons with tooltips', async ({ page }) => {
    await page.goto('/');
    await openRightPanel(page);
    await expect(page.locator('[title="Format Code (Shift+Alt+F)"]')).toBeVisible();
    await expect(page.locator('[title="AI Code Review"]')).toBeVisible();
    await expect(page.locator('[title="S/4HANA Compatibility Check"]')).toBeVisible();
    await expect(page.locator('[title="Explain Code"]')).toBeVisible();
    await expect(page.locator('[title="Run Unit Tests"]')).toBeVisible();
    await expect(page.locator('[title="Optimize Code"]')).toBeVisible();
  });

  test('chat input is visible and accepts text', async ({ page }) => {
    await page.goto('/');
    await openRightPanel(page);
    const chatInput = page.getByPlaceholder(/ask anything/i);
    await expect(chatInput).toBeVisible();
    await chatInput.fill('explain this code');
    await expect(chatInput).toHaveValue('explain this code');
  });

  test('send button is disabled when input is empty', async ({ page }) => {
    await page.goto('/');
    await openRightPanel(page);
    const sendButton = page.locator('[title="Send (Enter)"]');
    await expect(sendButton).toBeVisible();
    await expect(sendButton).toBeDisabled();
  });

  test('send button enabled when input has text and object is open', async ({ page }) => {
    await page.goto('/');
    await openObject(page);
    await openRightPanel(page);
    const chatInput = page.getByPlaceholder(/ask anything/i);
    await chatInput.fill('explain this code');
    const sendButton = page.locator('[title="Send (Enter)"]');
    await expect(sendButton).toBeEnabled();
  });

  test('Enter sends message and clears input', async ({ page }) => {
    await page.goto('/');
    await openObject(page);
    await openRightPanel(page);
    const chatInput = page.getByPlaceholder(/ask anything/i);
    await chatInput.fill('explain this code');
    await chatInput.press('Enter');
    await expect(chatInput).toHaveValue('');
    await expect(page.getByText('explain this code')).toBeVisible({ timeout: 3000 });
  });

  test('Shift+Enter adds newline instead of sending', async ({ page }) => {
    await page.goto('/');
    await openRightPanel(page);
    const chatInput = page.getByPlaceholder(/ask anything/i);
    await chatInput.fill('line one');
    await chatInput.press('Shift+Enter');
    await chatInput.type('line two');
    const value = await chatInput.inputValue();
    expect(value).toContain('line one');
    expect(value).toContain('line two');
  });

  test('format button triggers format API call', async ({ page }) => {
    await page.goto('/');
    await openObject(page);
    await openRightPanel(page);
    const formatButton = page.locator('[title="Format Code (Shift+Alt+F)"]');
    const formatPromise = page.waitForRequest('**/api/v1/format');
    await formatButton.click();
    const request = await formatPromise;
    expect(request.method()).toBe('POST');
  });

  test('clear button clears messages', async ({ page }) => {
    await page.goto('/');
    await openRightPanel(page);
    const clearButton = page.locator('[title="Clear"]');
    await expect(clearButton).toBeVisible();
    await clearButton.click();
  });
});
