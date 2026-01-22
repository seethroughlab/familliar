/**
 * Profile service for Netflix-style multi-user support.
 *
 * Manages selectable profiles that work across devices.
 * No passwords needed - protected by Tailscale.
 */
import { db, type DeviceProfile, type CachedProfile } from '../db';

export interface Profile {
  id: string;
  name: string;
  color: string | null;
  avatar_url: string | null;
  created_at: string;
  has_spotify: boolean;
  has_lastfm: boolean;
}

export interface ProfileCreate {
  name: string;
  color?: string;
}

export interface ListProfilesOptions {
  allowCache?: boolean;
}

export interface ValidateProfileOptions {
  requireOnline?: boolean;
}

let cachedProfileId: string | null = null;

// ============================================================================
// Profile Caching Functions (for offline support)
// ============================================================================

/**
 * Cache a profile in IndexedDB for offline access.
 */
export async function cacheProfile(profile: Profile): Promise<void> {
  const cached: CachedProfile = {
    id: profile.id,
    name: profile.name,
    color: profile.color,
    avatar_url: profile.avatar_url,
    has_spotify: profile.has_spotify,
    has_lastfm: profile.has_lastfm,
    cachedAt: new Date(),
  };
  await db.cachedProfiles.put(cached);
}

/**
 * Get a single cached profile by ID.
 */
export async function getCachedProfile(profileId: string): Promise<CachedProfile | undefined> {
  return db.cachedProfiles.get(profileId);
}

/**
 * Get all cached profiles.
 */
export async function getCachedProfiles(): Promise<CachedProfile[]> {
  return db.cachedProfiles.toArray();
}

/**
 * Clear a cached profile.
 */
export async function clearCachedProfile(profileId: string): Promise<void> {
  await db.cachedProfiles.delete(profileId);
}

/**
 * Convert CachedProfile to Profile format.
 */
function cachedToProfile(cached: CachedProfile): Profile {
  return {
    id: cached.id,
    name: cached.name,
    color: cached.color,
    avatar_url: cached.avatar_url,
    has_spotify: cached.has_spotify,
    has_lastfm: cached.has_lastfm,
    created_at: cached.cachedAt.toISOString(),
  };
}

// ============================================================================
// Profile Selection Functions
// ============================================================================

/**
 * Get the currently selected profile ID.
 * Returns null if no profile is selected.
 */
export async function getSelectedProfileId(): Promise<string | null> {
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
 * Select a profile (store in IndexedDB).
 * Call this after user picks a profile from the selector.
 */
export async function selectProfile(profileId: string): Promise<void> {
  const profile: DeviceProfile = {
    id: 'device-profile',
    profileId: profileId,
    deviceId: '', // No longer used
    createdAt: new Date(),
  };
  await db.deviceProfile.put(profile);
  cachedProfileId = profileId;
}

/**
 * Clear the selected profile.
 * Use this to show the profile selector again.
 */
export async function clearSelectedProfile(): Promise<void> {
  await db.deviceProfile.delete('device-profile');
  cachedProfileId = null;
}

/**
 * List all available profiles from the server.
 * When offline with allowCache, falls back to cached profiles.
 */
export async function listProfiles(options?: ListProfilesOptions): Promise<Profile[]> {
  try {
    const response = await fetch('/api/v1/profiles');
    if (!response.ok) {
      throw new Error(`Failed to list profiles: ${response.statusText}`);
    }
    const profiles: Profile[] = await response.json();

    // Cache all profiles for offline use
    await Promise.all(profiles.map((p) => cacheProfile(p)));

    return profiles;
  } catch (error) {
    // If offline and cache allowed, return cached profiles
    if (options?.allowCache) {
      const cached = await getCachedProfiles();
      if (cached.length > 0) {
        return cached.map(cachedToProfile);
      }
    }
    throw error;
  }
}

/**
 * Create a new profile.
 */
export async function createProfile(data: ProfileCreate): Promise<Profile> {
  const response = await fetch('/api/v1/profiles', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(data),
  });

  if (!response.ok) {
    throw new Error(`Failed to create profile: ${response.statusText}`);
  }

  return response.json();
}

/**
 * Get profile by ID.
 * Caches on success, falls back to cache on network error.
 */
export async function getProfile(
  profileId: string,
  options?: { allowCache?: boolean }
): Promise<Profile | null> {
  try {
    const response = await fetch(`/api/v1/profiles/${profileId}`);
    if (response.status === 404) {
      // Profile deleted on server - clear cache
      await clearCachedProfile(profileId);
      return null;
    }
    if (!response.ok) {
      throw new Error(`Failed to get profile: ${response.statusText}`);
    }
    const profile: Profile = await response.json();

    // Cache for offline use
    await cacheProfile(profile);

    return profile;
  } catch (error) {
    // If offline and cache allowed, return cached profile
    if (options?.allowCache) {
      const cached = await getCachedProfile(profileId);
      if (cached) {
        return cachedToProfile(cached);
      }
    }
    throw error;
  }
}

/**
 * Update a profile.
 */
export async function updateProfile(profileId: string, data: Partial<ProfileCreate>): Promise<Profile> {
  const response = await fetch(`/api/v1/profiles/${profileId}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(data),
  });

  if (!response.ok) {
    throw new Error(`Failed to update profile: ${response.statusText}`);
  }

  return response.json();
}

/**
 * Delete a profile.
 */
export async function deleteProfile(profileId: string): Promise<void> {
  const response = await fetch(`/api/v1/profiles/${profileId}`, {
    method: 'DELETE',
  });

  if (!response.ok) {
    throw new Error(`Failed to delete profile: ${response.statusText}`);
  }

  // If this was the selected profile, clear it
  const selectedId = await getSelectedProfileId();
  if (selectedId === profileId) {
    await clearSelectedProfile();
  }
}

/**
 * Validate that the selected profile still exists.
 * Returns the profile if valid, null otherwise.
 *
 * When offline (requireOnline=false), uses cached profile data.
 */
export async function validateSelectedProfile(
  options?: ValidateProfileOptions
): Promise<Profile | null> {
  const profileId = await getSelectedProfileId();
  if (!profileId) {
    return null;
  }

  const requireOnline = options?.requireOnline ?? true;

  try {
    const profile = await getProfile(profileId, { allowCache: !requireOnline });
    if (!profile) {
      // Profile was deleted, clear the selection
      await clearSelectedProfile();
      return null;
    }
    return profile;
  } catch (error) {
    // Network error - if we don't require online, try cache
    if (!requireOnline) {
      const cached = await getCachedProfile(profileId);
      if (cached) {
        return cachedToProfile(cached);
      }
    }
    throw error;
  }
}

/**
 * Initialize profile on app startup.
 * Returns the selected profile if valid, null if profile selector should be shown.
 *
 * When offline, uses cached profile data and schedules background validation.
 */
export async function initializeProfile(): Promise<Profile | null> {
  const profileId = await getSelectedProfileId();
  if (!profileId) {
    return null;
  }

  try {
    // Try online validation first
    return await validateSelectedProfile({ requireOnline: true });
  } catch {
    // Network error - try cached profile
    const cached = await getCachedProfile(profileId);
    if (cached) {
      // Schedule background validation when online
      scheduleBackgroundValidation(profileId);
      return cachedToProfile(cached);
    }
    return null;
  }
}

/**
 * Schedule background validation when network becomes available.
 * Dispatches 'profile-invalidated' event if profile was deleted.
 */
function scheduleBackgroundValidation(profileId: string): void {
  const handleOnline = async () => {
    window.removeEventListener('online', handleOnline);
    try {
      const profile = await getProfile(profileId);
      if (!profile) {
        // Profile was deleted on server
        await clearSelectedProfile();
        await clearCachedProfile(profileId);
        window.dispatchEvent(new CustomEvent('profile-invalidated'));
      }
    } catch {
      // Still can't reach server, try again later
      window.addEventListener('online', handleOnline, { once: true });
    }
  };

  if (navigator.onLine) {
    // Already online, validate immediately
    handleOnline();
  } else {
    // Wait for online
    window.addEventListener('online', handleOnline, { once: true });
  }
}

// Legacy exports for backwards compatibility during migration
export const getOrCreateDeviceProfile = getSelectedProfileId;
export const clearDeviceProfile = clearSelectedProfile;
export const getCurrentProfileId = getSelectedProfileId;
