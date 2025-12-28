/**
 * Profile service for Netflix-style multi-user support.
 *
 * Manages selectable profiles that work across devices.
 * No passwords needed - protected by Tailscale.
 */
import { db, type DeviceProfile } from '../db';

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

let cachedProfileId: string | null = null;

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
 */
export async function listProfiles(): Promise<Profile[]> {
  const response = await fetch('/api/v1/profiles');
  if (!response.ok) {
    throw new Error(`Failed to list profiles: ${response.statusText}`);
  }
  return response.json();
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
 */
export async function getProfile(profileId: string): Promise<Profile | null> {
  const response = await fetch(`/api/v1/profiles/${profileId}`);
  if (response.status === 404) {
    return null;
  }
  if (!response.ok) {
    throw new Error(`Failed to get profile: ${response.statusText}`);
  }
  return response.json();
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
 */
export async function validateSelectedProfile(): Promise<Profile | null> {
  const profileId = await getSelectedProfileId();
  if (!profileId) {
    return null;
  }

  const profile = await getProfile(profileId);
  if (!profile) {
    // Profile was deleted, clear the selection
    await clearSelectedProfile();
    return null;
  }

  return profile;
}

/**
 * Initialize profile on app startup.
 * Returns the selected profile if valid, null if profile selector should be shown.
 */
export async function initializeProfile(): Promise<Profile | null> {
  return validateSelectedProfile();
}

// Legacy exports for backwards compatibility during migration
export const getOrCreateDeviceProfile = getSelectedProfileId;
export const clearDeviceProfile = clearSelectedProfile;
export const getCurrentProfileId = getSelectedProfileId;
