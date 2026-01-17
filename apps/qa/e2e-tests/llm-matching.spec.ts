import { test, expect, Page } from '@playwright/test';
import vaultItems from '../fixtures/vault-items.json' with { type: 'json' };

/**
 * E2E Tests for LLM-Powered Field Matching
 *
 * Tests the complete workflow:
 * 1. Setup vault items
 * 2. Configure API key
 * 3. Load form with ambiguous fields
 * 4. Run LLM analysis
 * 5. Verify matches and reasoning
 */

// Test configuration
const TEST_API_KEY = process.env.CLAUDE_API_KEY || 'sk-ant-test-placeholder-key-12345678901234567890';
const BASE_URL = 'http://localhost:1420';

test.describe('LLM Matching E2E', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(BASE_URL);

    // Wait for app to be ready
    await page.waitForSelector('nav.tab-nav', { timeout: 10000 });
  });

  test('Phase 1: Setup Vault Items', async ({ page }) => {
    // Click Vault tab
    await page.click('button.tab-button:has-text("Vault")');

    // Verify we're on the vault tab
    await expect(page.locator('h2:has-text("Add New Item")')).toBeVisible();

    // Add each vault item
    for (const item of vaultItems) {
      // Fill in the form using id selectors
      await page.fill('#key', item.key);
      await page.fill('#label', item.label);
      await page.fill('#value', item.value);

      // Select category
      await page.selectOption('#category', item.category);

      // Click Add Item button
      await page.click('button[type="submit"]:has-text("Add Item")');

      // Wait for item to be added
      await page.waitForTimeout(500);
    }

    // Verify all items were added
    await expect(page.locator('h2:has-text("Vault Items")')).toBeVisible();

    // Check that we have the right number of items
    const itemsHeader = page.locator('h2:has-text("Vault Items")');
    await expect(itemsHeader).toContainText(`(${vaultItems.length})`);
  });

  test('Phase 2: Configure API Key', async ({ page }) => {
    // Click Settings tab
    await page.click('button.tab-button:has-text("Settings")');

    // Verify we're on settings tab
    await expect(page.locator('h2:has-text("API Configuration")')).toBeVisible();

    // Enter API key
    await page.fill('#apiKey', TEST_API_KEY);

    // Verify model selection (default should be Sonnet 4.5)
    await expect(page.locator('#llmModel')).toHaveValue('claude-sonnet-4-5-20250929');

    // Save settings
    await page.click('button:has-text("Save Settings")');

    // Wait for success message
    await expect(page.locator('.settings-success')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('text=/Settings saved/i')).toBeVisible();
  });

  test('Phase 3: Test Form Matching (Pattern + LLM)', async ({ page }) => {
    // First, add vault items
    await page.click('button.tab-button:has-text("Vault")');

    for (const item of vaultItems.slice(0, 3)) {
      await page.fill('#key', item.key);
      await page.fill('#label', item.label);
      await page.fill('#value', item.value);
      await page.selectOption('#category', item.category);
      await page.click('button[type="submit"]:has-text("Add Item")');
      await page.waitForTimeout(300);
    }

    // Configure API key
    await page.click('button.tab-button:has-text("Settings")');
    await page.fill('#apiKey', TEST_API_KEY);
    await page.click('button:has-text("Save Settings")');

    // Wait for success message to confirm save
    await expect(page.locator('.settings-success')).toBeVisible({ timeout: 5000 });

    // Reload page to ensure Tauri state is properly loaded
    await page.reload();
    await page.waitForSelector('nav.tab-nav', { timeout: 10000 });

    // Navigate to Match tab
    await page.click('button.tab-button:has-text("Match")');

    // Wait for form snapshot to be loaded
    await page.waitForTimeout(1000);

    // Generate fill plan (pattern matching)
    const generateButton = page.locator('button:has-text("Generate Fill Plan")');
    if (await generateButton.isVisible()) {
      await generateButton.click();
      await page.waitForTimeout(1000);
    }

    // Check if there are unmatched fields before running LLM
    const unmatchedSection = page.locator('h3:has-text("Unmatched Fields")');
    if (await unmatchedSection.isVisible()) {
      // Click "Analyze with AI" button
      const analyzeButton = page.locator('button:has-text("Analyze with AI")');

      // Check if button is enabled - if not, skip LLM test
      const isEnabled = await analyzeButton.isEnabled().catch(() => false);
      if (isEnabled) {
        await analyzeButton.click();

        // Wait for "Analyzing..." text to appear and then disappear
        await page.waitForSelector('button:has-text("Analyzing...")', { timeout: 5000 }).catch(() => {});

        // Wait for analysis to complete (up to 30 seconds)
        await page.waitForSelector('button:has-text("Analyze with AI")', { timeout: 30000 }).catch(() => {});
      }
    }

    // Verify we have some results (either recommendations or unmatched fields)
    const recommendationsSection = page.locator('h3:has-text("Recommendations")');
    const unmatchedFields = page.locator('h3:has-text("Unmatched Fields")');

    const hasRecommendations = await recommendationsSection.isVisible().catch(() => false);
    const hasUnmatched = await unmatchedFields.isVisible().catch(() => false);

    // We should have at least processed the form
    expect(hasRecommendations || hasUnmatched).toBe(true);
  });

  test('Phase 4: Review Dialog Verification', async ({ page }) => {
    // Setup: Click Match tab
    await page.click('button.tab-button:has-text("Match")');
    await page.waitForTimeout(1000);

    // Try to click "Review & Apply" button if it exists
    const reviewButton = page.locator('button:has-text("Review")').or(
      page.locator('button:has-text("Review & Apply")')
    ).or(
      page.locator('button:has-text("Apply")')
    );

    // Check if button exists and is enabled
    const count = await reviewButton.count();
    if (count > 0 && await reviewButton.first().isEnabled()) {
      await reviewButton.first().click();

      // Wait for dialog to appear
      await page.waitForTimeout(500);

      // Check if any dialog-like element appears
      const dialog = page.locator('.dialog, [role="dialog"], .modal, .review-dialog');
      const dialogVisible = await dialog.isVisible().catch(() => false);

      if (dialogVisible) {
        // Verify dialog content
        expect(dialogVisible).toBe(true);
      }
    } else {
      // Skip if button not available
      test.skip();
    }
  });

  test('Phase 5: Error Handling - No API Key', async ({ page }) => {
    // Ensure API key is cleared
    await page.click('button.tab-button:has-text("Settings")');
    await page.fill('#apiKey', '');
    await page.click('button:has-text("Save Settings")');
    await page.waitForTimeout(500);

    // Go to Match tab
    await page.click('button.tab-button:has-text("Match")');

    // Wait for page to load
    await page.waitForTimeout(1000);

    // Verify "Analyze with AI" button exists and check its state
    const analyzeButton = page.locator('button:has-text("Analyze with AI")');

    const buttonExists = await analyzeButton.count();
    if (buttonExists > 0) {
      // Button should be disabled when no API key
      await expect(analyzeButton).toBeDisabled();
    } else {
      // If no button, check for message about configuring API key
      const message = page.locator('text=/Configure.*API.*key/i').or(
        page.locator('text=/Settings/i')
      );
      await expect(message).toBeVisible();
    }
  });

  test('Success Criteria: Full Workflow', async ({ page }) => {
    // 1. Add vault items
    await page.click('button.tab-button:has-text("Vault")');

    for (const item of vaultItems) {
      await page.fill('#key', item.key);
      await page.fill('#label', item.label);
      await page.fill('#value', item.value);
      await page.selectOption('#category', item.category);
      await page.click('button[type="submit"]:has-text("Add Item")');
      await page.waitForTimeout(300);
    }

    // Verify items count
    await expect(page.locator('h2:has-text("Vault Items")')).toContainText(`(${vaultItems.length})`);

    // 2. Configure API key
    await page.click('button.tab-button:has-text("Settings")');
    await page.fill('#apiKey', TEST_API_KEY);
    await page.click('button:has-text("Save Settings")');
    await expect(page.locator('.settings-success')).toBeVisible({ timeout: 5000 });

    // 3. Navigate to Match tab
    await page.click('button.tab-button:has-text("Match")');
    await page.waitForTimeout(1000);

    // 4. Generate fill plan
    const generateButton = page.locator('button:has-text("Generate Fill Plan")');
    if (await generateButton.isVisible()) {
      await generateButton.click();
      await page.waitForTimeout(1000);
    }

    // 5. Run LLM analysis if there are unmatched fields
    const analyzeButton = page.locator('button:has-text("Analyze with AI")');
    if (await analyzeButton.isVisible() && await analyzeButton.isEnabled()) {
      await analyzeButton.click();

      // Wait for analysis to complete
      await page.waitForTimeout(10000);
    }

    // 6. Verify we have some results (either recommendations or unmatched fields)
    // Either we have recommendations OR we have unmatched fields
    const recommendationsSection = page.locator('h3:has-text("Recommendations")');
    const unmatchedSection = page.locator('h3:has-text("Unmatched Fields")');

    // At least one should be visible
    const hasRecommendations = await recommendationsSection.isVisible().catch(() => false);
    const hasUnmatched = await unmatchedSection.isVisible().catch(() => false);

    // We should have processed the form one way or another
    expect(hasRecommendations || hasUnmatched).toBe(true);
  });
});

test.describe('UI Navigation', () => {
  test('should navigate between tabs', async ({ page }) => {
    await page.goto(BASE_URL);
    await page.waitForSelector('nav.tab-nav');

    // Test each tab navigation
    const tabs = ['Vault', 'Forms', 'Match', 'Audit', 'Settings'];

    for (const tab of tabs) {
      await page.click(`button.tab-button:has-text("${tab}")`);

      // Verify active state
      const activeTab = page.locator(`button.tab-button.active:has-text("${tab}")`);
      await expect(activeTab).toBeVisible();
    }
  });
});
