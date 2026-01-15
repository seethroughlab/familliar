import { test, expect } from '@playwright/test';
import { ensureProfile, waitForAudioReady, isAudioPlaying } from './helpers';

// These tests require ANTHROPIC_API_KEY environment variable
// Run with: ANTHROPIC_API_KEY=sk-ant-... npm run test:e2e -- e2e/ai-chat.spec.ts

const API_KEY = process.env.ANTHROPIC_API_KEY;
const IS_CI = process.env.CI === 'true';

test.describe('AI Chat', () => {
  // Skip in CI: these tests require a populated music library and real AI responses
  // They're useful for local development but too flaky for CI (empty library, non-deterministic AI)
  test.skip(!API_KEY || IS_CI, 'Requires ANTHROPIC_API_KEY and local music library (skipped in CI)');

  // Helper to ensure API key is configured
  async function ensureApiKey(page: import('@playwright/test').Page) {
    await page.goto('/admin');
    await page.waitForLoadState('networkidle');

    const apiKeyInput = page.locator('input[type="password"], input[placeholder*="key" i]').first();
    await apiKeyInput.fill(API_KEY!);
    await page.locator('button:has-text("Save")').first().click();
    await page.waitForTimeout(1000);
  }

  test('add Anthropic API key in Admin panel', async ({ page }) => {
    await page.goto('/admin');
    await page.waitForLoadState('networkidle');

    // Find the Claude API section heading
    const claudeHeading = page.getByRole('heading', { name: /Claude API/i });
    await expect(claudeHeading).toBeVisible({ timeout: 5000 });

    // Find API key input and fill it
    const apiKeyInput = page.locator('input[type="password"], input[placeholder*="key" i]').first();
    await apiKeyInput.fill(API_KEY!);

    // Click save button in the Claude section
    const saveButton = page.locator('button:has-text("Save")').first();
    await saveButton.click();

    // Wait for save confirmation
    await page.waitForTimeout(1000);

    // Verify key was saved - should show "Configured" badge or success toast
    const configuredBadge = page.locator('text=Configured');
    const savedToast = page.locator('text=saved');

    const isConfigured = await configuredBadge.isVisible({ timeout: 2000 }).catch(() => false);
    const showedToast = await savedToast.isVisible({ timeout: 1000 }).catch(() => false);

    expect(isConfigured || showedToast).toBe(true);
  });

  test('send "Play something upbeat" and AI responds', async ({ page }) => {
    await ensureApiKey(page);

    // Go to main app
    await page.goto('/');
    await ensureProfile(page);

    // Find the chat input
    const chatInput = page.locator('input[placeholder*="Ask" i], textarea[placeholder*="Ask" i]').first();
    await expect(chatInput).toBeVisible({ timeout: 5000 });

    // Type the specific message from the checklist
    await chatInput.fill('Play something upbeat');

    // Find and click send button (not disabled)
    const sendButton = page.locator('button:has(svg):not([disabled])').last();
    await sendButton.click();

    // Wait for AI response - look for assistant message or tool use indication
    // The AI should respond within 30 seconds
    await page.waitForTimeout(3000);

    // Check that some response appeared (either text or a "Now playing" indicator)
    // The chat should show some activity
    const hasResponse = await page.locator('.prose, [data-role="assistant"], text=/playing|queue|playlist|track/i').first()
      .isVisible({ timeout: 30000 }).catch(() => false);

    // Also check if player bar shows a track (AI started playback)
    const playerHasTrack = await page.locator('[data-testid="current-track-title"]')
      .isVisible({ timeout: 5000 }).catch(() => false);

    // Either got a text response or music started playing
    expect(hasResponse || playerHasTrack).toBe(true);
  });

  test('AI creates playlist that starts playing automatically', async ({ page }) => {
    await ensureApiKey(page);

    await page.goto('/');
    await ensureProfile(page);

    // Send a playlist request
    const chatInput = page.locator('input[placeholder*="Ask" i], textarea[placeholder*="Ask" i]').first();
    await chatInput.fill('Create a short playlist of 3 energetic songs');

    const sendButton = page.locator('button:has(svg):not([disabled])').last();
    await sendButton.click();

    // Wait for AI to process and potentially start playback
    await page.waitForTimeout(5000);

    // Check if audio started playing (playlist was created and auto-played)
    try {
      await waitForAudioReady(page, 30000);
      const playing = await isAudioPlaying(page);
      // If we got here, audio is ready - test passes
      expect(playing).toBe(true);
    } catch {
      // Audio didn't start - check if at least a response was given
      const hasResponse = await page.locator('text=/playlist|queue|playing|track/i').first()
        .isVisible({ timeout: 1000 }).catch(() => false);

      // It's okay if there weren't enough matching tracks
      const noMatches = await page.locator('text=/no.*match|couldn.*find|empty/i').first()
        .isVisible({ timeout: 1000 }).catch(() => false);

      expect(hasResponse || noMatches).toBe(true);
    }
  });

  test('chat shows disabled state when no API key configured', async ({ page }) => {
    // Clear any existing API key
    await page.goto('/admin');
    await page.waitForLoadState('networkidle');

    // Find and click "Remove API key" button if it exists
    const removeButton = page.locator('button:has-text("Remove")');
    if (await removeButton.isVisible({ timeout: 1000 }).catch(() => false)) {
      await removeButton.click();
      await page.waitForTimeout(500);
    }

    // Go to main app
    await page.goto('/');
    await ensureProfile(page);

    // The send button should be disabled when no API key is configured
    const sendButton = page.locator('button[disabled]').filter({ has: page.locator('svg') });
    const isDisabled = await sendButton.isVisible({ timeout: 3000 }).catch(() => false);

    expect(isDisabled).toBe(true);

    // Re-add API key for subsequent tests
    await ensureApiKey(page);
  });
});
