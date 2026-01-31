import { test, expect } from '@playwright/test';

// These tests verify integration status display in the Admin panel.
// API keys are now configured via environment variables (docker/.env),
// so these tests verify the status indicators rather than input fields.

const SPOTIFY_CLIENT_ID = process.env.SPOTIFY_CLIENT_ID;
const SPOTIFY_CLIENT_SECRET = process.env.SPOTIFY_CLIENT_SECRET;
const LASTFM_API_KEY = process.env.LASTFM_API_KEY;
const LASTFM_API_SECRET = process.env.LASTFM_API_SECRET;

test.describe('Spotify Integration', () => {
  test('Spotify status card shows in Admin panel', async ({ page }) => {
    await page.goto('/admin');
    await page.waitForLoadState('networkidle');

    // Find the Spotify status card using exact text match
    const spotifyCard = page.getByText('Spotify', { exact: true });
    await expect(spotifyCard).toBeVisible({ timeout: 5000 });
  });

  test('Spotify shows configured status when env vars are set', async ({ page }) => {
    test.skip(!SPOTIFY_CLIENT_ID || !SPOTIFY_CLIENT_SECRET, 'Requires SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET env vars');

    await page.goto('/admin');
    await page.waitForLoadState('networkidle');

    // Find the Spotify card and check for configured status (green checkmark)
    const spotifySection = page.locator('.bg-zinc-800').filter({ hasText: /^Spotify/ });
    await expect(spotifySection).toBeVisible({ timeout: 5000 });

    // Should have a green checkmark indicating configured
    const checkIcon = spotifySection.locator('.text-green-400');
    await expect(checkIcon).toBeVisible({ timeout: 5000 });
  });
});

test.describe('Last.fm Integration', () => {
  test('Last.fm status card shows in Admin panel', async ({ page }) => {
    await page.goto('/admin');
    await page.waitForLoadState('networkidle');

    // Find the Last.fm status card using exact text match
    const lastfmCard = page.getByText('Last.fm', { exact: true });
    await expect(lastfmCard).toBeVisible({ timeout: 5000 });
  });

  test('Last.fm shows configured status when env vars are set', async ({ page }) => {
    test.skip(!LASTFM_API_KEY || !LASTFM_API_SECRET, 'Requires LASTFM_API_KEY and LASTFM_API_SECRET env vars');

    await page.goto('/admin');
    await page.waitForLoadState('networkidle');

    // Find the Last.fm card and check for configured status (green checkmark)
    const lastfmSection = page.locator('.bg-zinc-800').filter({ hasText: /^Last\.fm/ });
    await expect(lastfmSection).toBeVisible({ timeout: 5000 });

    // Should have a green checkmark indicating configured
    const checkIcon = lastfmSection.locator('.text-green-400');
    await expect(checkIcon).toBeVisible({ timeout: 5000 });
  });
});

test.describe('Claude API Integration', () => {
  test('Claude API status card shows in Admin panel', async ({ page }) => {
    await page.goto('/admin');
    await page.waitForLoadState('networkidle');

    // Find the Claude API status card
    const claudeCard = page.getByText('Claude API', { exact: true });
    await expect(claudeCard).toBeVisible({ timeout: 5000 });
  });
});

test.describe('AcoustID Integration', () => {
  test('AcoustID status card shows in Admin panel', async ({ page }) => {
    await page.goto('/admin');
    await page.waitForLoadState('networkidle');

    // Find the AcoustID status card
    const acoustidCard = page.getByText('AcoustID', { exact: true });
    await expect(acoustidCard).toBeVisible({ timeout: 5000 });
  });
});
