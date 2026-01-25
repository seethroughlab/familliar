/**
 * Playwright global setup - runs once before all tests.
 * Triggers a library sync to ensure test fixtures are available.
 *
 * The music library path is configured via MUSIC_LIBRARY_PATH env var
 * on the backend (set in CI workflow).
 */
import { request } from '@playwright/test';

const BASE_URL = process.env.BASE_URL || 'http://localhost:4400';

async function globalSetup() {
  console.log('🎵 Setting up E2E test environment...');

  const context = await request.newContext({
    baseURL: BASE_URL,
  });

  try {
    // Trigger a library sync (scan + analysis)
    // The MUSIC_LIBRARY_PATH env var on the backend points to test fixtures
    console.log('🔍 Starting library sync...');
    const syncResponse = await context.post('/api/v1/library/sync');

    if (!syncResponse.ok()) {
      console.error('Failed to start sync:', await syncResponse.text());
      throw new Error('Failed to start library sync');
    }

    // Poll for sync completion
    console.log('⏳ Waiting for sync to complete...');

    let attempts = 0;
    const maxAttempts = 120; // 120 seconds max

    while (attempts < maxAttempts) {
      const statusResponse = await context.get('/api/v1/library/sync/status');

      if (statusResponse.ok()) {
        const status = await statusResponse.json();

        if (status.status === 'idle' || status.status === 'complete' || status.status === 'completed') {
          const progress = status.progress;
          console.log(
            `✅ Sync completed: ${progress?.files_discovered || 0} files, ${progress?.tracks_added || progress?.new_tracks || 0} tracks added`
          );
          break;
        } else if (status.status === 'error') {
          console.error('Sync failed:', status.message);
          throw new Error(`Library sync failed: ${status.message}`);
        }
        // Status is 'running' or 'started' - keep polling
      }

      await new Promise((resolve) => setTimeout(resolve, 1000));
      attempts++;
    }

    if (attempts >= maxAttempts) {
      console.warn('⚠️ Sync timed out after 120 seconds');
    }

    // Verify tracks are available
    const tracksResponse = await context.get('/api/v1/library/tracks?limit=1');
    if (tracksResponse.ok()) {
      const tracks = await tracksResponse.json();
      console.log(`📊 Library has ${tracks.total || 0} tracks available for testing`);
    }

    console.log('✅ E2E setup complete');
  } finally {
    await context.dispose();
  }
}

export default globalSetup;
