import { useState, useEffect } from 'react';
import { User, RefreshCw } from 'lucide-react';
import { getSelectedProfileId, getProfile, clearSelectedProfile, type Profile } from '../../services/profileService';

export function ProfileSettings() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadProfile();
  }, []);

  async function loadProfile() {
    try {
      const profileId = await getSelectedProfileId();
      if (profileId) {
        const p = await getProfile(profileId);
        setProfile(p);
      }
    } catch (err) {
      console.error('Failed to load profile:', err);
    } finally {
      setLoading(false);
    }
  }

  async function handleSwitchProfile() {
    await clearSelectedProfile();
    // Dispatch event to trigger profile selector in App.tsx
    window.dispatchEvent(new CustomEvent('profile-invalidated'));
  }

  if (loading) {
    return (
      <div className="bg-zinc-800/50 rounded-lg p-4 animate-pulse">
        <div className="h-6 bg-zinc-700 rounded w-1/3"></div>
      </div>
    );
  }

  return (
    <div className="bg-zinc-800/50 rounded-lg p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          {/* Profile avatar */}
          <div
            className="w-10 h-10 rounded-lg flex items-center justify-center text-lg font-bold text-white"
            style={{ backgroundColor: profile?.color || '#3B82F6' }}
          >
            {profile?.name?.charAt(0).toUpperCase() || <User className="w-5 h-5" />}
          </div>
          <div>
            <div className="font-medium text-white">{profile?.name || 'Unknown Profile'}</div>
            <div className="text-sm text-zinc-400">
              {profile?.has_spotify && 'Spotify'}
              {profile?.has_spotify && profile?.has_lastfm && ' · '}
              {profile?.has_lastfm && 'Last.fm'}
              {!profile?.has_spotify && !profile?.has_lastfm && 'No integrations'}
            </div>
          </div>
        </div>
        <button
          onClick={handleSwitchProfile}
          className="flex items-center gap-2 px-3 py-2 bg-zinc-700 hover:bg-zinc-600 rounded-lg text-sm text-zinc-300 hover:text-white transition-colors"
        >
          <RefreshCw className="w-4 h-4" />
          Switch Profile
        </button>
      </div>
    </div>
  );
}
