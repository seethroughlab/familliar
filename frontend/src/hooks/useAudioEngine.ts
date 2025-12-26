import { useEffect, useRef, useCallback } from 'react';
import { usePlayerStore } from '../stores/playerStore';
import { tracksApi } from '../api/client';
import { getOfflineTrack, createOfflineTrackUrl, revokeOfflineTrackUrl } from '../services/offlineService';

const CROSSFADE_DURATION = 3; // seconds

// Singleton audio context and analyser for visualizer access
let globalAudioContext: AudioContext | null = null;
let globalAnalyser: AnalyserNode | null = null;
let globalMediaSource: MediaElementAudioSourceNode | null = null;
let globalAudioElement: HTMLAudioElement | null = null;

export function getAudioAnalyser(): AnalyserNode | null {
  return globalAnalyser;
}

export function getAudioContext(): AudioContext | null {
  return globalAudioContext;
}

export function useAudioEngine() {
  const audioContextRef = useRef<AudioContext | null>(null);
  const currentSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const nextSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const gainCurrentRef = useRef<GainNode | null>(null);
  const gainNextRef = useRef<GainNode | null>(null);
  const currentBufferRef = useRef<AudioBuffer | null>(null);
  const startTimeRef = useRef<number>(0);
  const pausedAtRef = useRef<number>(0);
  const animationFrameRef = useRef<number | undefined>(undefined);
  const isLoadingRef = useRef(false);
  const analyserRef = useRef<AnalyserNode | null>(null);

  // For fallback when Web Audio API has issues, keep a simple audio element
  const fallbackAudioRef = useRef<HTMLAudioElement | null>(null);
  const useFallbackRef = useRef(false);

  // Track current offline URL for cleanup
  const currentOfflineUrlRef = useRef<string | null>(null);

  const {
    currentTrack,
    isPlaying,
    volume,
    queue,
    queueIndex,
    setCurrentTime,
    setDuration,
    setIsPlaying,
    playNext,
  } = usePlayerStore();

  // Initialize audio context and fallback
  useEffect(() => {
    // Initialize fallback audio element (reuse global if exists)
    if (!fallbackAudioRef.current) {
      if (globalAudioElement) {
        fallbackAudioRef.current = globalAudioElement;
      } else {
        fallbackAudioRef.current = new Audio();
        fallbackAudioRef.current.preload = 'auto';
        fallbackAudioRef.current.crossOrigin = 'anonymous';
        globalAudioElement = fallbackAudioRef.current;
      }
    }

    // Try to initialize Web Audio API with analyser
    try {
      if (!audioContextRef.current) {
        // Reuse global context if exists
        if (globalAudioContext) {
          audioContextRef.current = globalAudioContext;
          analyserRef.current = globalAnalyser;
        } else {
          audioContextRef.current = new AudioContext();
          globalAudioContext = audioContextRef.current;

          // Create analyser for visualizer
          analyserRef.current = audioContextRef.current.createAnalyser();
          analyserRef.current.fftSize = 256;
          analyserRef.current.smoothingTimeConstant = 0.8;
          globalAnalyser = analyserRef.current;

          // Connect audio element to analyser (only once)
          if (fallbackAudioRef.current && !globalMediaSource) {
            globalMediaSource = audioContextRef.current.createMediaElementSource(fallbackAudioRef.current);
            globalMediaSource.connect(analyserRef.current);
            analyserRef.current.connect(audioContextRef.current.destination);
          }
        }

        gainCurrentRef.current = audioContextRef.current.createGain();
        gainNextRef.current = audioContextRef.current.createGain();
        gainCurrentRef.current.connect(audioContextRef.current.destination);
        gainNextRef.current.connect(audioContextRef.current.destination);
      }
    } catch (e) {
      console.warn('Web Audio API not available, using fallback:', e);
      useFallbackRef.current = true;
    }

    // Setup fallback audio event handlers
    const audio = fallbackAudioRef.current;
    const handleEnded = () => playNext();
    const handleError = (e: Event) => {
      console.error('Audio error:', e);
      setIsPlaying(false);
    };
    const handleLoadedMetadata = () => {
      if (useFallbackRef.current && audio) {
        setDuration(audio.duration);
      }
    };

    audio?.addEventListener('ended', handleEnded);
    audio?.addEventListener('error', handleError);
    audio?.addEventListener('loadedmetadata', handleLoadedMetadata);

    return () => {
      audio?.removeEventListener('ended', handleEnded);
      audio?.removeEventListener('error', handleError);
      audio?.removeEventListener('loadedmetadata', handleLoadedMetadata);
    };
  }, [playNext, setIsPlaying, setDuration]);

  // Load audio buffer
  const loadAudioBuffer = useCallback(async (url: string): Promise<AudioBuffer | null> => {
    if (!audioContextRef.current || useFallbackRef.current) return null;

    try {
      const response = await fetch(url);
      const arrayBuffer = await response.arrayBuffer();
      return await audioContextRef.current.decodeAudioData(arrayBuffer);
    } catch (e) {
      console.error('Failed to load audio buffer:', e);
      return null;
    }
  }, []);

  // Update Media Session API
  const updateMediaSession = useCallback(() => {
    if (!('mediaSession' in navigator) || !currentTrack) return;

    navigator.mediaSession.metadata = new MediaMetadata({
      title: currentTrack.title || 'Unknown',
      artist: currentTrack.artist || 'Unknown',
      album: currentTrack.album || 'Unknown',
      artwork: currentTrack.id ? [
        { src: tracksApi.getArtworkUrl(currentTrack.id), sizes: '512x512', type: 'image/jpeg' }
      ] : []
    });

    navigator.mediaSession.setActionHandler('play', () => {
      setIsPlaying(true);
    });
    navigator.mediaSession.setActionHandler('pause', () => {
      setIsPlaying(false);
    });
    navigator.mediaSession.setActionHandler('nexttrack', () => {
      playNext();
    });
    navigator.mediaSession.setActionHandler('previoustrack', () => {
      usePlayerStore.getState().playPrevious();
    });
    navigator.mediaSession.setActionHandler('seekto', (details) => {
      if (details.seekTime !== undefined) {
        seek(details.seekTime);
      }
    });
  }, [currentTrack, setIsPlaying, playNext]);

  // Load and play track
  useEffect(() => {
    if (!currentTrack) {
      // Stop everything
      if (currentSourceRef.current) {
        try { currentSourceRef.current.stop(); } catch { /* Already stopped */ }
        currentSourceRef.current = null;
      }
      if (fallbackAudioRef.current) {
        fallbackAudioRef.current.pause();
        fallbackAudioRef.current.src = '';
      }
      // Clean up any offline URL
      if (currentOfflineUrlRef.current) {
        revokeOfflineTrackUrl(currentOfflineUrlRef.current);
        currentOfflineUrlRef.current = null;
      }
      return;
    }

    // Clean up previous offline URL
    if (currentOfflineUrlRef.current) {
      revokeOfflineTrackUrl(currentOfflineUrlRef.current);
      currentOfflineUrlRef.current = null;
    }

    isLoadingRef.current = true;

    // Check for offline track first, then fall back to streaming
    const loadTrack = async () => {
      let audioUrl: string;

      // Try to get offline track
      const offlineBlob = await getOfflineTrack(currentTrack.id);
      if (offlineBlob) {
        audioUrl = createOfflineTrackUrl(offlineBlob);
        currentOfflineUrlRef.current = audioUrl;
        console.log('Playing from offline cache:', currentTrack.title);
      } else {
        audioUrl = tracksApi.getStreamUrl(currentTrack.id);
      }

      // Use fallback for now (simpler and more reliable for streaming)
      // Web Audio API crossfade will be used for track transitions
      useFallbackRef.current = true;

      if (fallbackAudioRef.current) {
        fallbackAudioRef.current.src = audioUrl;
        fallbackAudioRef.current.load();

        if (isPlaying) {
          fallbackAudioRef.current.play().catch(console.error);
        }
      }

      // Also preload buffer for crossfade capability
      const buffer = await loadAudioBuffer(audioUrl);
      if (buffer) {
        currentBufferRef.current = buffer;
        setDuration(buffer.duration);
      }
      isLoadingRef.current = false;
    };

    loadTrack();
    updateMediaSession();
    pausedAtRef.current = 0;
    startTimeRef.current = 0;
  }, [currentTrack?.id, loadAudioBuffer, setDuration, updateMediaSession, isPlaying]);

  // Handle play/pause
  useEffect(() => {
    if (!currentTrack) return;

    const audio = fallbackAudioRef.current;
    if (!audio) return;

    if (isPlaying) {
      // Resume audio context if suspended
      if (audioContextRef.current?.state === 'suspended') {
        audioContextRef.current.resume();
      }

      audio.play().catch((err) => {
        console.error('Play failed:', err);
        setIsPlaying(false);
      });

      // Update media session playback state
      if ('mediaSession' in navigator) {
        navigator.mediaSession.playbackState = 'playing';
      }
    } else {
      audio.pause();

      if ('mediaSession' in navigator) {
        navigator.mediaSession.playbackState = 'paused';
      }
    }
  }, [isPlaying, currentTrack, setIsPlaying]);

  // Handle volume changes
  useEffect(() => {
    if (fallbackAudioRef.current) {
      fallbackAudioRef.current.volume = volume;
    }
    if (gainCurrentRef.current) {
      gainCurrentRef.current.gain.value = volume;
    }
    if (gainNextRef.current) {
      gainNextRef.current.gain.value = volume;
    }
  }, [volume]);

  // Update time during playback
  useEffect(() => {
    const updateTime = () => {
      if (fallbackAudioRef.current && isPlaying) {
        const currentTime = fallbackAudioRef.current.currentTime;
        setCurrentTime(currentTime);

        // Update media session position
        if ('mediaSession' in navigator && 'setPositionState' in navigator.mediaSession) {
          try {
            navigator.mediaSession.setPositionState({
              duration: fallbackAudioRef.current.duration || 0,
              playbackRate: 1,
              position: currentTime
            });
          } catch { /* mediaSession not fully supported */ }
        }

        // Check if we should start crossfade to next track
        const duration = fallbackAudioRef.current.duration;
        const timeRemaining = duration - currentTime;

        if (timeRemaining <= CROSSFADE_DURATION && timeRemaining > 0 && queueIndex < queue.length - 1) {
          // Preload next track for crossfade
          const nextTrack = queue[queueIndex + 1];
          if (nextTrack && !nextSourceRef.current) {
            // TODO: Implement actual crossfade with Web Audio API
            // For now, just let the track end naturally
          }
        }

        animationFrameRef.current = requestAnimationFrame(updateTime);
      }
    };

    if (isPlaying) {
      animationFrameRef.current = requestAnimationFrame(updateTime);
    }

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [isPlaying, setCurrentTime, queue, queueIndex]);

  // Handle track end
  useEffect(() => {
    const audio = fallbackAudioRef.current;
    if (!audio) return;

    const handleEnded = () => {
      playNext();
    };

    audio.addEventListener('ended', handleEnded);
    return () => audio.removeEventListener('ended', handleEnded);
  }, [playNext]);

  // Seek function
  const seek = useCallback((time: number) => {
    if (fallbackAudioRef.current) {
      fallbackAudioRef.current.currentTime = time;
      setCurrentTime(time);
    }
    pausedAtRef.current = time;
  }, [setCurrentTime]);

  // Toggle play/pause
  const togglePlayPause = useCallback(() => {
    setIsPlaying(!isPlaying);
  }, [isPlaying, setIsPlaying]);

  // Crossfade to next track (advanced feature)
  const crossfadeTo = useCallback(async (trackId: string) => {
    if (!audioContextRef.current || !gainCurrentRef.current || !gainNextRef.current) {
      // Fallback: just switch tracks
      return;
    }

    const url = tracksApi.getStreamUrl(trackId);
    const buffer = await loadAudioBuffer(url);
    if (!buffer) return;

    const ctx = audioContextRef.current;
    const now = ctx.currentTime;

    // Create new source
    nextSourceRef.current = ctx.createBufferSource();
    nextSourceRef.current.buffer = buffer;
    nextSourceRef.current.connect(gainNextRef.current);

    // Crossfade gains
    gainCurrentRef.current.gain.setValueAtTime(volume, now);
    gainCurrentRef.current.gain.linearRampToValueAtTime(0, now + CROSSFADE_DURATION);
    gainNextRef.current.gain.setValueAtTime(0, now);
    gainNextRef.current.gain.linearRampToValueAtTime(volume, now + CROSSFADE_DURATION);

    // Start next source
    nextSourceRef.current.start(now);

    // Swap after crossfade
    setTimeout(() => {
      if (currentSourceRef.current) {
        try { currentSourceRef.current.stop(); } catch { /* Already stopped */ }
      }
      currentSourceRef.current = nextSourceRef.current;
      nextSourceRef.current = null;
      currentBufferRef.current = buffer;

      // Swap gain nodes
      const temp = gainCurrentRef.current;
      gainCurrentRef.current = gainNextRef.current;
      gainNextRef.current = temp;
    }, CROSSFADE_DURATION * 1000);
  }, [loadAudioBuffer, volume]);

  // Get the audio context for WebRTC streaming
  const getContext = useCallback((): AudioContext | null => {
    return audioContextRef.current || globalAudioContext;
  }, []);

  // Get the output node (analyser) for WebRTC streaming
  const getOutputNode = useCallback((): AudioNode | null => {
    return analyserRef.current || globalAnalyser;
  }, []);

  return {
    seek,
    togglePlayPause,
    crossfadeTo,
    getContext,
    getOutputNode,
  };
}
