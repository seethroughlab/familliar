/**
 * Device profile service for multi-user support.
 *
 * Manages device-based profiles that allow multiple family members
 * to have separate Spotify/Last.fm connections without requiring login.
 */
import { db, type DeviceProfile } from '../db';
import { generateUUID } from '../utils/uuid';

interface ProfileRegistrationResponse {
  profile_id: string;
  device_id: string;
  created_at: string;
  has_spotify: boolean;
  has_lastfm: boolean;
}

let cachedProfileId: string | null = null;

/**
 * Get or create a device profile.
 *
 * On first call:
 * 1. Generates a unique device ID
 * 2. Registers with the backend to get a profile_id
 * 3. Stores both in IndexedDB
 *
 * On subsequent calls:
 * Returns the cached profile_id from IndexedDB.
 */
export async function getOrCreateDeviceProfile(): Promise<string> {
  // Return cached value if available
  if (cachedProfileId) {
    return cachedProfileId;
  }

  // Check IndexedDB for existing profile
  const existing = await db.deviceProfile.get('device-profile');
  if (existing) {
    cachedProfileId = existing.profileId;
    return existing.profileId;
  }

  // Generate new device ID
  const deviceId = generateUUID();

  // Register with backend
  const response = await fetch('/api/v1/profiles/register', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ device_id: deviceId }),
  });

  if (!response.ok) {
    throw new Error(`Failed to register profile: ${response.statusText}`);
  }

  const data: ProfileRegistrationResponse = await response.json();

  // Store in IndexedDB
  const profile: DeviceProfile = {
    id: 'device-profile',
    profileId: data.profile_id,
    deviceId: deviceId,
    createdAt: new Date(),
  };
  await db.deviceProfile.put(profile);

  cachedProfileId = data.profile_id;
  return data.profile_id;
}

/**
 * Get the current profile ID if one exists (without creating).
 */
export async function getCurrentProfileId(): Promise<string | null> {
  if (cachedProfileId) {
    return cachedProfileId;
  }

  const existing = await db.deviceProfile.get('device-profile');
  if (existing) {
    cachedProfileId = existing.profileId;
    return existing.profileId;
  }

  return null;
}

/**
 * Clear the device profile (for testing/debugging).
 */
export async function clearDeviceProfile(): Promise<void> {
  await db.deviceProfile.delete('device-profile');
  cachedProfileId = null;
}

/**
 * Ensure profile is initialized.
 * Call this early in app startup.
 */
export async function initializeProfile(): Promise<void> {
  await getOrCreateDeviceProfile();
}
