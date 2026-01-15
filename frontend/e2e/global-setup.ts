/**
 * Playwright global setup - runs once before all tests.
 * Configures the music library path and scans for tracks.
 */
import { request } from '@playwright/test';

const BASE_URL = process.env.BASE_URL || 'http://localhost:4400';

async function globalSetup() {
  console.log('🎵 Setting up E2E test environment...');

  const context = await request.newContext({
    baseURL: BASE_URL,
  });

  try {
    // 1. Configure the music library path to use test fixtures
    // The fixtures are in backend/tests/fixtures/audio/ relative to repo root
    // In CI, the working directory is the repo root
    const fixturesPath = process.env.CI
      ? '/home/runner/work/familiar/familiar/backend/tests/fixtures/audio'
      : process.cwd().replace('/frontend', '') + '/backend/tests/fixtures/audio';

    console.log(`📁 Configuring library path: ${fixturesPath}`);

    const settingsResponse = await context.put('/api/settings', {
      data: {
        music_library_paths: [fixturesPath],
      },
    });

    if (!settingsResponse.ok()) {
      console.error('Failed to configure library path:', await settingsResponse.text());
      throw new Error('Failed to configure library path');
    }

    // 2. Trigger a library scan
    console.log('🔍 Scanning library...');
    const scanResponse = await context.post('/api/library/scan');

    if (!scanResponse.ok()) {
      console.error('Failed to start scan:', await scanResponse.text());
      throw new Error('Failed to start library scan');
    }

    const scanResult = await scanResponse.json();
    const taskId = scanResult.task_id;

    if (!taskId) {
      console.log('No task ID returned - scan may have completed immediately');
    } else {
      // 3. Poll for scan completion
      console.log(`⏳ Waiting for scan to complete (task: ${taskId})...`);

      let attempts = 0;
      const maxAttempts = 60; // 60 seconds max

      while (attempts < maxAttempts) {
        const statusResponse = await context.get(`/api/tasks/${taskId}`);

        if (statusResponse.ok()) {
          const status = await statusResponse.json();

          if (status.status === 'completed') {
            console.log(`✅ Scan completed: ${status.result?.tracks_added || 0} tracks added`);
            break;
          } else if (status.status === 'failed') {
            console.error('Scan failed:', status.error);
            throw new Error(`Library scan failed: ${status.error}`);
          }
        }

        await new Promise((resolve) => setTimeout(resolve, 1000));
        attempts++;
      }

      if (attempts >= maxAttempts) {
        console.warn('⚠️ Scan timed out after 60 seconds');
      }
    }

    // 4. Verify tracks are available
    const tracksResponse = await context.get('/api/library/tracks?limit=1');
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
