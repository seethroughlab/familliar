import { test, expect } from '@playwright/test';

// These tests require environment variables for API credentials
// Run with: SPOTIFY_CLIENT_ID=xxx SPOTIFY_CLIENT_SECRET=xxx LASTFM_API_KEY=xxx LASTFM_API_SECRET=xxx npm run test:e2e -- e2e/integrations.spec.ts

const SPOTIFY_CLIENT_ID = process.env.SPOTIFY_CLIENT_ID;
const SPOTIFY_CLIENT_SECRET = process.env.SPOTIFY_CLIENT_SECRET;
const LASTFM_API_KEY = process.env.LASTFM_API_KEY;
const LASTFM_API_SECRET = process.env.LASTFM_API_SECRET;

test.describe('Spotify Integration', () => {
  test.skip(!SPOTIFY_CLIENT_ID || !SPOTIFY_CLIENT_SECRET, 'Requires SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET');

  test('add Spotify client ID/secret in Admin panel', async ({ page }) => {
    await page.goto('/admin');
    await page.waitForLoadState('networkidle');

    // Find the Spotify API section
    const spotifyHeading = page.getByRole('heading', { name: /Spotify API/i });
    await expect(spotifyHeading).toBeVisible({ timeout: 5000 });

    // Find the Spotify inputs - there should be two (client ID and secret)
    const spotifySection = page.locator('section, div').filter({ has: spotifyHeading });
    const inputs = spotifySection.locator('input');

    // Fill client ID (first input)
    await inputs.first().fill(SPOTIFY_CLIENT_ID!);

    // Fill client secret (second input)
    await inputs.nth(1).fill(SPOTIFY_CLIENT_SECRET!);

    // Save
    const saveButton = spotifySection.locator('button:has-text("Save")');
    await saveButton.click();

    await page.waitForTimeout(1000);

    // Should show configured or save confirmation
    const isConfigured = await page.locator('text=Configured').nth(1).isVisible({ timeout: 2000 }).catch(() => false);
    const savedToast = await page.locator('text=saved').isVisible({ timeout: 1000 }).catch(() => false);

    expect(isConfigured || savedToast).toBe(true);
  });

  test('"Connect to Spotify" button appears after saving credentials', async ({ page }) => {
    // First save credentials
    await page.goto('/admin');
    await page.waitForLoadState('networkidle');

    const spotifyHeading = page.getByRole('heading', { name: /Spotify API/i });
    const spotifySection = page.locator('section, div').filter({ has: spotifyHeading });
    const inputs = spotifySection.locator('input');

    await inputs.first().fill(SPOTIFY_CLIENT_ID!);
    await inputs.nth(1).fill(SPOTIFY_CLIENT_SECRET!);
    await spotifySection.locator('button:has-text("Save")').click();
    await page.waitForTimeout(1000);

    // Look for Connect button
    const connectButton = page.locator('button:has-text("Connect"), a:has-text("Connect")').filter({ hasText: /spotify/i });
    const hasConnectButton = await connectButton.isVisible({ timeout: 3000 }).catch(() => false);

    // Or check for "Configured" status which indicates credentials are saved
    const isConfigured = await spotifySection.locator('text=Configured').isVisible({ timeout: 1000 }).catch(() => false);

    expect(hasConnectButton || isConfigured).toBe(true);
  });
});

test.describe('Last.fm Integration', () => {
  test.skip(!LASTFM_API_KEY || !LASTFM_API_SECRET, 'Requires LASTFM_API_KEY and LASTFM_API_SECRET');

  test('add Last.fm API key/secret in Admin panel', async ({ page }) => {
    await page.goto('/admin');
    await page.waitForLoadState('networkidle');

    // Find the Last.fm API section
    const lastfmHeading = page.getByRole('heading', { name: /Last\.fm API/i });
    await expect(lastfmHeading).toBeVisible({ timeout: 5000 });

    // Find the Last.fm inputs
    const lastfmSection = page.locator('section, div').filter({ has: lastfmHeading });
    const inputs = lastfmSection.locator('input');

    // Fill API key (first input)
    await inputs.first().fill(LASTFM_API_KEY!);

    // Fill API secret (second input)
    await inputs.nth(1).fill(LASTFM_API_SECRET!);

    // Save
    const saveButton = lastfmSection.locator('button:has-text("Save")');
    await saveButton.click();

    await page.waitForTimeout(1000);

    // Should show configured or save confirmation
    const isConfigured = await lastfmSection.locator('text=Configured').isVisible({ timeout: 2000 }).catch(() => false);
    const savedToast = await page.locator('text=saved').isVisible({ timeout: 1000 }).catch(() => false);

    expect(isConfigured || savedToast).toBe(true);
  });

  test('"Connect Last.fm" button appears after saving credentials', async ({ page }) => {
    // First save credentials
    await page.goto('/admin');
    await page.waitForLoadState('networkidle');

    const lastfmHeading = page.getByRole('heading', { name: /Last\.fm API/i });
    const lastfmSection = page.locator('section, div').filter({ has: lastfmHeading });
    const inputs = lastfmSection.locator('input');

    await inputs.first().fill(LASTFM_API_KEY!);
    await inputs.nth(1).fill(LASTFM_API_SECRET!);
    await lastfmSection.locator('button:has-text("Save")').click();
    await page.waitForTimeout(1000);

    // Look for Connect button
    const connectButton = page.locator('button:has-text("Connect"), a:has-text("Connect")').filter({ hasText: /last\.?fm/i });
    const hasConnectButton = await connectButton.isVisible({ timeout: 3000 }).catch(() => false);

    // Or check for "Configured" status
    const isConfigured = await lastfmSection.locator('text=Configured').isVisible({ timeout: 1000 }).catch(() => false);

    expect(hasConnectButton || isConfigured).toBe(true);
  });
});
