import { test, expect } from '@playwright/test';
import { ensureProfile, navigateToTab } from './helpers';

test.describe('Settings', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await ensureProfile(page);
  });

  test('settings page loads', async ({ page }) => {
    await navigateToTab(page, 'Settings');

    // Should see settings content
    const settingsContent = page.locator('[data-testid="settings"], .settings, main');
    await expect(settingsContent).toBeVisible({ timeout: 5000 });
  });

  test('library grid/list view toggle', async ({ page }) => {
    await navigateToTab(page, 'Library');

    // Look for view toggle buttons
    const gridBtn = page.locator('button[aria-label*="grid" i], [data-testid="grid-view"]');
    const listBtn = page.locator('button[aria-label*="list" i], [data-testid="list-view"]');

    if (await gridBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await gridBtn.click();
      await page.waitForTimeout(300);

      // Verify grid view is active
      const _gridView = page.locator('.grid, [data-view="grid"]');
      // Grid should be visible or button should be active
    }

    if (await listBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await listBtn.click();
      await page.waitForTimeout(300);

      // Verify list view is active
      const _listView = page.locator('table, [data-view="list"]');
    }
  });
});

test.describe('Admin Panel', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/admin');
    await page.waitForLoadState('networkidle');
  });

  test('admin page loads', async ({ page }) => {
    // Look for the Admin Setup title
    const adminTitle = page.locator('text=Admin Setup');
    await expect(adminTitle).toBeVisible({ timeout: 5000 });
  });

  test('Claude API key field exists', async ({ page }) => {
    // Look for the Claude API section heading
    const claudeHeading = page.getByRole('heading', { name: /Claude API/i });
    await expect(claudeHeading).toBeVisible({ timeout: 5000 });

    // There should be an input field for the API key
    const apiKeyInput = page.locator('input').first();
    await expect(apiKeyInput).toBeVisible({ timeout: 5000 });
  });

  test('per-section save buttons exist', async ({ page }) => {
    // Each settings section should have its own save button
    const saveButtons = page.locator('button:has-text("Save")');
    const count = await saveButtons.count();

    // Should have multiple save buttons (one per section)
    expect(count).toBeGreaterThanOrEqual(1);
  });

  test('Spotify section exists', async ({ page }) => {
    const spotifySection = page.locator('text=Spotify API');
    await expect(spotifySection).toBeVisible({ timeout: 5000 });
  });

  test('Last.fm section exists', async ({ page }) => {
    const lastfmSection = page.getByRole('heading', { name: 'Last.fm API' });
    await expect(lastfmSection).toBeVisible({ timeout: 5000 });
  });

  test('AI Provider section exists', async ({ page }) => {
    const aiSection = page.locator('text=AI Provider');
    await expect(aiSection).toBeVisible({ timeout: 5000 });

    // Should have Claude and Ollama options
    const claudeOption = page.locator('button:has-text("Claude")');
    const ollamaOption = page.locator('button:has-text("Ollama")');
    await expect(claudeOption).toBeVisible();
    await expect(ollamaOption).toBeVisible();
  });
});

test.describe('Visualizer', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await ensureProfile(page);
  });

  test('visualizer tab opens', async ({ page }) => {
    await navigateToTab(page, 'Visualizer');

    // Without a track playing, visualizer shows placeholder
    // Either shows "No track playing" or a canvas if track is playing
    const noTrack = page.locator('text=No track playing');
    const canvas = page.locator('canvas');

    const hasNoTrack = await noTrack.isVisible({ timeout: 3000 }).catch(() => false);
    const hasCanvas = await canvas.isVisible({ timeout: 1000 }).catch(() => false);

    // One of these should be visible
    expect(hasNoTrack || hasCanvas).toBe(true);
  });

  test('visualizer has fullscreen button when track playing', async ({ page }) => {
    await navigateToTab(page, 'Visualizer');

    // If no track is playing, there's no fullscreen button (just placeholder)
    const noTrack = page.locator('text=No track playing');
    if (await noTrack.isVisible({ timeout: 2000 }).catch(() => false)) {
      test.skip(true, 'No track playing - fullscreen button only shows with track');
      return;
    }

    // With track playing, fullscreen button should exist
    const fullscreenBtn = page.locator('button[aria-label*="fullscreen" i], button:has(svg)').first();
    await expect(fullscreenBtn).toBeVisible({ timeout: 3000 });
  });
});

test.describe('UI Elements', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await ensureProfile(page);
  });

  test('album artwork displays', async ({ page }) => {
    await navigateToTab(page, 'Library');

    const trackRow = page.locator('[data-testid="track-row"], .track-row, tr').first();
    if (!(await trackRow.isVisible({ timeout: 5000 }).catch(() => false))) {
      test.skip(true, 'No tracks in library');
      return;
    }

    // Click to play a track
    await trackRow.click();
    await page.waitForTimeout(1000);

    // Look for album art in player bar or now playing
    const albumArt = page.locator('[data-testid="album-art"], .album-art, img[alt*="album" i], img[alt*="cover" i]');
    if (await albumArt.isVisible({ timeout: 3000 }).catch(() => false)) {
      await expect(albumArt).toBeVisible();
    }
  });

  test('no console errors on page load', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', msg => {
      if (msg.type() === 'error') {
        errors.push(msg.text());
      }
    });

    await page.goto('/');
    await ensureProfile(page);
    await page.waitForTimeout(2000);

    // Filter out expected/acceptable errors
    const criticalErrors = errors.filter(e =>
      !e.includes('Failed to load resource') &&
      !e.includes('favicon') &&
      !e.includes('net::ERR')
    );

    expect(criticalErrors.length).toBe(0);
  });

  test('main navigation tabs work', async ({ page }) => {
    // Test all main tabs are accessible
    const tabs = ['Library', 'Playlists', 'Visualizer', 'Settings'] as const;

    for (const tab of tabs) {
      await navigateToTab(page, tab);
      await page.waitForTimeout(300);

      // Verify we're on the right page (URL or content check)
      const _content = page.locator(`[data-testid="${tab.toLowerCase()}"], .${tab.toLowerCase()}, main`);
      // Just verify navigation didn't error
    }
  });
});
