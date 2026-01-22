import { useEffect, useRef, useCallback } from 'react';
import { usePlayerStore } from '../stores/playerStore';
import { useAudioSettingsStore } from '../stores/audioSettingsStore';
import { tracksApi } from '../api/client';
import type { Track } from '../types';
import {
  getOfflineTrack,
  createOfflineTrackUrl,
  revokeOfflineTrackUrl,
} from '../services/offlineService';
import { EffectsChain, initEffectsChain } from '../services/audioEffects';

// ============================================================================
// Global Audio Graph State (singleton pattern for visualizer access)
// ============================================================================

// Audio context and nodes
let globalAudioContext: AudioContext | null = null;
let globalAnalyser: AnalyserNode | null = null;
let globalMasterGain: GainNode | null = null;
let globalEffectsChain: EffectsChain | null = null;

// Dual audio element system for crossfade
let globalAudioElementA: HTMLAudioElement | null = null;
let globalAudioElementB: HTMLAudioElement | null = null;
let globalMediaSourceA: MediaElementAudioSourceNode | null = null;
let globalMediaSourceB: MediaElementAudioSourceNode | null = null;
let globalGainA: GainNode | null = null;
let globalGainB: GainNode | null = null;

// Track which element is currently playing
let currentElementIsA = true;

// Crossfade state
interface CrossfadeContext {
  isActive: boolean;
  startTime: number;
  duration: number;
  timeoutId: ReturnType<typeof setTimeout> | null;
}
let crossfadeContext: CrossfadeContext | null = null;

// Offline URL tracking for cleanup
let currentOfflineUrl: string | null = null;
let nextOfflineUrl: string | null = null;

// ============================================================================
// Exported functions for visualizer and WebRTC access
// ============================================================================

export function getAudioAnalyser(): AnalyserNode | null {
  return globalAnalyser;
}

export function getAudioContext(): AudioContext | null {
  return globalAudioContext;
}

export function getAudioEffectsChain(): EffectsChain | null {
  return globalEffectsChain;
}

// ============================================================================
// Audio Graph Initialization
// ============================================================================

function initializeAudioGraph(): boolean {
  if (globalAudioContext && globalAudioElementA && globalAudioElementB) {
    return true; // Already initialized
  }

  try {
    // Create audio context
    if (!globalAudioContext) {
      globalAudioContext = new AudioContext();
    }

    // Create audio elements and add to DOM (hidden, for playback and e2e test access)
    if (!globalAudioElementA) {
      globalAudioElementA = new Audio();
      globalAudioElementA.preload = 'auto';
      globalAudioElementA.crossOrigin = 'anonymous';
      globalAudioElementA.style.display = 'none';
      document.body.appendChild(globalAudioElementA);
    }

    if (!globalAudioElementB) {
      globalAudioElementB = new Audio();
      globalAudioElementB.preload = 'auto';
      globalAudioElementB.crossOrigin = 'anonymous';
      globalAudioElementB.style.display = 'none';
      document.body.appendChild(globalAudioElementB);
    }

    // Create media sources (once per element, forever)
    if (!globalMediaSourceA) {
      globalMediaSourceA = globalAudioContext.createMediaElementSource(
        globalAudioElementA
      );
    }

    if (!globalMediaSourceB) {
      globalMediaSourceB = globalAudioContext.createMediaElementSource(
        globalAudioElementB
      );
    }

    // Create gain nodes for crossfade
    if (!globalGainA) {
      globalGainA = globalAudioContext.createGain();
      globalGainA.gain.value = 1; // A starts as current
    }

    if (!globalGainB) {
      globalGainB = globalAudioContext.createGain();
      globalGainB.gain.value = 0; // B starts as next
    }

    // Create master gain for volume control
    if (!globalMasterGain) {
      globalMasterGain = globalAudioContext.createGain();
    }

    // Create analyser for visualizer
    if (!globalAnalyser) {
      globalAnalyser = globalAudioContext.createAnalyser();
      globalAnalyser.fftSize = 256;
      globalAnalyser.smoothingTimeConstant = 0.8;
    }

    // Create effects chain
    if (!globalEffectsChain) {
      globalEffectsChain = initEffectsChain(globalAudioContext);
    }

    // Connect the audio graph:
    // MediaSourceA -> GainA -> MasterGain -> EffectsChain -> Analyser -> Destination
    // MediaSourceB -> GainB -> MasterGain -> EffectsChain -> Analyser -> Destination
    globalMediaSourceA.connect(globalGainA);
    globalMediaSourceB.connect(globalGainB);
    globalGainA.connect(globalMasterGain);
    globalGainB.connect(globalMasterGain);
    globalMasterGain.connect(globalEffectsChain.input);
    globalEffectsChain.output.connect(globalAnalyser);
    globalAnalyser.connect(globalAudioContext.destination);

    return true;
  } catch (e) {
    console.error('Failed to initialize audio graph:', e);
    return false;
  }
}

// ============================================================================
// Helper Functions
// ============================================================================

function getCurrentElement(): HTMLAudioElement | null {
  return currentElementIsA ? globalAudioElementA : globalAudioElementB;
}

function getNextElement(): HTMLAudioElement | null {
  return currentElementIsA ? globalAudioElementB : globalAudioElementA;
}

function getCurrentGain(): GainNode | null {
  return currentElementIsA ? globalGainA : globalGainB;
}

function getNextGain(): GainNode | null {
  return currentElementIsA ? globalGainB : globalGainA;
}

async function getTrackUrl(trackId: string): Promise<{
  url: string;
  isOffline: boolean;
}> {
  const offlineBlob = await getOfflineTrack(trackId);
  if (offlineBlob) {
    return {
      url: createOfflineTrackUrl(offlineBlob),
      isOffline: true,
    };
  }
  return {
    url: tracksApi.getStreamUrl(trackId),
    isOffline: false,
  };
}

function cleanupElement(
  element: HTMLAudioElement | null,
  offlineUrl: string | null
): void {
  if (element) {
    element.pause();
    element.currentTime = 0;
    element.src = '';
    element.load(); // Reset internal state
  }
  if (offlineUrl) {
    revokeOfflineTrackUrl(offlineUrl);
  }
}

// ============================================================================
// Main Hook
// ============================================================================

export function useAudioEngine() {
  const animationFrameRef = useRef<number | undefined>(undefined);
  const isLoadingRef = useRef(false);
  const preloadingTrackIdRef = useRef<string | null>(null);
  const loadedTrackIdRef = useRef<string | null>(null);
  const loadIdRef = useRef(0);
  const errorCountRef = useRef(0);
  const lastErrorTrackRef = useRef<string | null>(null);
  // Track when we're in a queue transition to ignore spurious ended events
  const queueTransitionRef = useRef(false);

  const {
    currentTrack,
    isPlaying,
    volume,
    crossfadeState,
    nextTrackPreloaded,
    setCurrentTime,
    setDuration,
    setIsPlaying,
    playNext,
    setCrossfadeState,
    setNextTrackPreloaded,
    getNextTrack,
    advanceToNextTrack,
  } = usePlayerStore();

  const { crossfadeDuration, crossfadeEnabled } = useAudioSettingsStore();

  // --------------------------------------------------------------------------
  // Preload next track
  // --------------------------------------------------------------------------
  const preloadNextTrack = useCallback(
    async (trackId: string): Promise<boolean> => {
      if (preloadingTrackIdRef.current === trackId) {
        return false; // Already preloading this track
      }

      preloadingTrackIdRef.current = trackId;
      const nextElement = getNextElement();
      if (!nextElement) return false;

      try {
        // Clean up any existing next track
        if (nextOfflineUrl) {
          revokeOfflineTrackUrl(nextOfflineUrl);
          nextOfflineUrl = null;
        }

        const { url, isOffline } = await getTrackUrl(trackId);
        if (isOffline) {
          nextOfflineUrl = url;
        }

        nextElement.src = url;
        nextElement.load();

        // Wait for enough data to play (with timeout)
        return new Promise((resolve) => {
          const cleanup = () => {
            clearTimeout(timeout);
            nextElement.removeEventListener('canplay', onCanPlay);
            nextElement.removeEventListener('error', onError);
          };

          const timeout = setTimeout(() => {
            cleanup();
            console.warn('Preload timeout for track:', trackId);
            preloadingTrackIdRef.current = null;
            resolve(false);
          }, 10000);

          const onCanPlay = () => {
            cleanup();
            preloadingTrackIdRef.current = null; // Clear on success
            resolve(true);
          };
          const onError = () => {
            cleanup();
            console.error('Failed to preload next track');
            preloadingTrackIdRef.current = null;
            resolve(false);
          };
          nextElement.addEventListener('canplay', onCanPlay);
          nextElement.addEventListener('error', onError);
        });
      } catch (e) {
        console.error('Error preloading track:', e);
        preloadingTrackIdRef.current = null;
        return false;
      }
    },
    []
  );

  // --------------------------------------------------------------------------
  // Execute crossfade
  // --------------------------------------------------------------------------
  const executeCrossfade = useCallback(
    (duration: number, nextTrack: Track) => {
      if (!globalAudioContext || !globalMasterGain) return;

      const currentGain = getCurrentGain();
      const nextGain = getNextGain();
      const nextElement = getNextElement();

      if (!currentGain || !nextGain || !nextElement) return;

      const ctx = globalAudioContext;
      const now = ctx.currentTime;

      // Cancel any existing ramps
      currentGain.gain.cancelScheduledValues(now);
      nextGain.gain.cancelScheduledValues(now);

      if (duration === 0) {
        // Gapless: instant switch
        currentGain.gain.setValueAtTime(0, now);
        nextGain.gain.setValueAtTime(1, now);
        nextElement.play().catch(console.error);
      } else {
        // Crossfade: ramp over duration
        currentGain.gain.setValueAtTime(1, now);
        currentGain.gain.linearRampToValueAtTime(0, now + duration);

        nextGain.gain.setValueAtTime(0, now);
        nextGain.gain.linearRampToValueAtTime(1, now + duration);

        // Start next track immediately (it will fade in)
        nextElement.play().catch(console.error);
      }

      // Store crossfade context
      const timeoutId = setTimeout(() => {
        completeCrossfade();
      }, duration * 1000);

      crossfadeContext = {
        isActive: true,
        startTime: now,
        duration,
        timeoutId,
      };

      // Mark the next track as loaded BEFORE advancing to prevent the track loading
      // effect from trying to reload it on the wrong element
      loadedTrackIdRef.current = nextTrack.id;

      // Advance the queue (updates UI to show next track)
      advanceToNextTrack(nextTrack);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- completeCrossfade is defined after, stable function
    [advanceToNextTrack]
  );

  // --------------------------------------------------------------------------
  // Complete crossfade
  // --------------------------------------------------------------------------
  const completeCrossfade = useCallback(() => {
    // Clean up old (now-inactive) element
    const oldElement = getCurrentElement();
    cleanupElement(oldElement, currentOfflineUrl);

    // Transfer offline URL ownership
    currentOfflineUrl = nextOfflineUrl;
    nextOfflineUrl = null;

    // Flip the current element flag
    currentElementIsA = !currentElementIsA;

    // Clear crossfade context
    if (crossfadeContext?.timeoutId) {
      clearTimeout(crossfadeContext.timeoutId);
    }
    crossfadeContext = null;

    // Reset preloading state
    preloadingTrackIdRef.current = null;

    // Update loaded track ref to the track that just became current via crossfade
    const currentId = usePlayerStore.getState().currentTrack?.id;
    if (currentId) {
      loadedTrackIdRef.current = currentId;
    }

    // Update store
    setCrossfadeState('idle');
    setNextTrackPreloaded(false);
  }, [setCrossfadeState, setNextTrackPreloaded]);

  // --------------------------------------------------------------------------
  // Cancel crossfade (e.g., on seek or skip)
  // --------------------------------------------------------------------------
  const cancelCrossfade = useCallback(() => {
    if (!crossfadeContext || !globalAudioContext) return;

    const ctx = globalAudioContext;
    const now = ctx.currentTime;

    const currentGain = getCurrentGain();
    const nextGain = getNextGain();
    const nextElement = getNextElement();

    // Cancel ramps and restore current element
    currentGain?.gain.cancelScheduledValues(now);
    nextGain?.gain.cancelScheduledValues(now);

    currentGain?.gain.setValueAtTime(1, now);
    nextGain?.gain.setValueAtTime(0, now);

    // Stop and reset next element
    cleanupElement(nextElement, nextOfflineUrl);
    nextOfflineUrl = null;

    // Clear timeout
    if (crossfadeContext.timeoutId) {
      clearTimeout(crossfadeContext.timeoutId);
    }
    crossfadeContext = null;

    // Reset state
    preloadingTrackIdRef.current = null;
    setCrossfadeState('idle');
    setNextTrackPreloaded(false);
  }, [setCrossfadeState, setNextTrackPreloaded]);

  // --------------------------------------------------------------------------
  // Update Media Session API
  // --------------------------------------------------------------------------
  const updateMediaSession = useCallback(() => {
    if (!('mediaSession' in navigator) || !currentTrack) return;

    navigator.mediaSession.metadata = new MediaMetadata({
      title: currentTrack.title || 'Unknown',
      artist: currentTrack.artist || 'Unknown',
      album: currentTrack.album || 'Unknown',
      artwork: currentTrack.id
        ? [
            {
              src: tracksApi.getArtworkUrl(currentTrack.id),
              sizes: '512x512',
              type: 'image/jpeg',
            },
          ]
        : [],
    });

    navigator.mediaSession.setActionHandler('play', () => setIsPlaying(true));
    navigator.mediaSession.setActionHandler('pause', () => setIsPlaying(false));
    navigator.mediaSession.setActionHandler('nexttrack', () => playNext());
    navigator.mediaSession.setActionHandler('previoustrack', () => {
      usePlayerStore.getState().playPrevious();
    });
    navigator.mediaSession.setActionHandler('seekto', (details) => {
      if (details.seekTime !== undefined) {
        seek(details.seekTime);
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- seek is defined after, playNext is stable
  }, [currentTrack, setIsPlaying, playNext]);

  // --------------------------------------------------------------------------
  // Seek function
  // --------------------------------------------------------------------------
  const seek = useCallback(
    (time: number) => {
      const currentElement = getCurrentElement();
      if (!currentElement) return;

      // If crossfading and user seeks backward, cancel crossfade
      if (crossfadeContext?.isActive) {
        const duration = currentElement.duration;
        const effectiveCrossfade = crossfadeEnabled ? crossfadeDuration : 0;
        if (duration - time > effectiveCrossfade + 1) {
          cancelCrossfade();
        }
      }

      currentElement.currentTime = time;
      setCurrentTime(time);
    },
    [setCurrentTime, crossfadeEnabled, crossfadeDuration, cancelCrossfade]
  );

  // --------------------------------------------------------------------------
  // Toggle play/pause
  // --------------------------------------------------------------------------
  const togglePlayPause = useCallback(() => {
    setIsPlaying(!isPlaying);
  }, [isPlaying, setIsPlaying]);

  // --------------------------------------------------------------------------
  // Initialize audio graph on mount
  // --------------------------------------------------------------------------
  useEffect(() => {
    initializeAudioGraph();

    // Setup event handlers for track end
    const handleEndedA = () => {
      // Ignore ended events during queue transitions (prevents skipping to wrong track)
      if (queueTransitionRef.current) {
        console.debug('[AudioEngine] Ignoring ended event during queue transition');
        return;
      }
      if (currentElementIsA && !crossfadeContext?.isActive) {
        playNext();
      }
    };
    const handleEndedB = () => {
      if (queueTransitionRef.current) {
        console.debug('[AudioEngine] Ignoring ended event during queue transition');
        return;
      }
      if (!currentElementIsA && !crossfadeContext?.isActive) {
        playNext();
      }
    };

    globalAudioElementA?.addEventListener('ended', handleEndedA);
    globalAudioElementB?.addEventListener('ended', handleEndedB);

    // Error handlers with retry/skip logic
    const handleError = (e: Event) => {
      const target = e.target as HTMLAudioElement;
      if (!target.src || target.src === window.location.href) return;

      // Only handle errors on the current element, not the preloading one
      const isCurrentElement =
        (currentElementIsA && target === globalAudioElementA) ||
        (!currentElementIsA && target === globalAudioElementB);
      if (!isCurrentElement) {
        console.warn('[AudioEngine] Ignoring error on inactive element');
        return;
      }

      console.error('Audio error:', e);

      const currentId = usePlayerStore.getState().currentTrack?.id;
      if (currentId === lastErrorTrackRef.current) {
        errorCountRef.current++;
        if (errorCountRef.current >= 3) {
          console.error('Skipping track after repeated errors:', currentId);
          errorCountRef.current = 0;
          lastErrorTrackRef.current = null;
          playNext();
          return;
        }
      } else {
        errorCountRef.current = 1;
        lastErrorTrackRef.current = currentId ?? null;
      }

      setIsPlaying(false);
    };

    globalAudioElementA?.addEventListener('error', handleError);
    globalAudioElementB?.addEventListener('error', handleError);

    return () => {
      globalAudioElementA?.removeEventListener('ended', handleEndedA);
      globalAudioElementB?.removeEventListener('ended', handleEndedB);
      globalAudioElementA?.removeEventListener('error', handleError);
      globalAudioElementB?.removeEventListener('error', handleError);
    };
  }, [playNext, setIsPlaying]);

  // --------------------------------------------------------------------------
  // Load and play track when currentTrack changes
  // --------------------------------------------------------------------------
  useEffect(() => {
    const currentElement = getCurrentElement();

    if (!currentTrack) {
      // Stop everything
      cleanupElement(globalAudioElementA, null);
      cleanupElement(globalAudioElementB, null);
      if (currentOfflineUrl) {
        revokeOfflineTrackUrl(currentOfflineUrl);
        currentOfflineUrl = null;
      }
      loadedTrackIdRef.current = null;
      return;
    }

    // Skip if this track is already loaded (happens after crossfade advance)
    if (loadedTrackIdRef.current === currentTrack.id) {
      return; // Already loaded this track
    }

    // Skip if crossfade is active - the track is already loaded on the next element
    // and will become current when crossfade completes
    if (crossfadeContext?.isActive) {
      return;
    }

    // Mark that we're in a queue/track transition to ignore spurious ended events
    queueTransitionRef.current = true;
    isLoadingRef.current = true;
    const currentLoadId = ++loadIdRef.current;
    const trackIdToLoad = currentTrack.id;

    const loadTrack = async () => {
      // Clean up previous
      if (currentOfflineUrl) {
        revokeOfflineTrackUrl(currentOfflineUrl);
        currentOfflineUrl = null;
      }

      const { url, isOffline } = await getTrackUrl(trackIdToLoad);

      // Check if this load is still valid (track may have changed)
      if (loadIdRef.current !== currentLoadId) {
        if (isOffline) {
          revokeOfflineTrackUrl(url); // Clean up the URL we just created
        }
        return;
      }

      if (isOffline) {
        currentOfflineUrl = url;
      }

      if (currentElement) {
        currentElement.src = url;
        currentElement.load();

        // Safety timeout to clear transition flag if canplay never fires
        const transitionTimeout = setTimeout(() => {
          if (loadIdRef.current === currentLoadId && queueTransitionRef.current) {
            console.warn('[AudioEngine] Transition timeout - clearing flag');
            queueTransitionRef.current = false;
          }
        }, 10000);

        // Wait for ready then play if isPlaying
        const playWhenReady = () => {
          if (loadIdRef.current !== currentLoadId) return; // Stale load
          clearTimeout(transitionTimeout);
          // Clear transition flag - track is ready, ended events are now valid
          queueTransitionRef.current = false;
          const shouldPlay = usePlayerStore.getState().isPlaying;
          if (shouldPlay) {
            currentElement.play().catch((err) => {
              if (err.name !== 'AbortError') {
                console.error('Play failed:', err);
              }
            });
          }
          currentElement.removeEventListener('canplay', playWhenReady);
        };

        const handleMetadata = () => {
          if (loadIdRef.current !== currentLoadId) return; // Stale load
          setDuration(currentElement.duration);
          loadedTrackIdRef.current = trackIdToLoad;
          currentElement.removeEventListener('loadedmetadata', handleMetadata);
        };

        const handleLoadError = () => {
          if (loadIdRef.current !== currentLoadId) return;
          clearTimeout(transitionTimeout);
          queueTransitionRef.current = false;
          currentElement.removeEventListener('error', handleLoadError);
        };

        currentElement.addEventListener('canplay', playWhenReady);
        currentElement.addEventListener('loadedmetadata', handleMetadata);
        currentElement.addEventListener('error', handleLoadError);
      }

      isLoadingRef.current = false;
    };

    loadTrack();
    updateMediaSession();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- Only re-run when track ID changes
  }, [currentTrack?.id, setDuration, updateMediaSession]);

  // --------------------------------------------------------------------------
  // Handle play/pause
  // --------------------------------------------------------------------------
  useEffect(() => {
    if (!currentTrack) return;

    const currentElement = getCurrentElement();
    if (!currentElement) return;

    if (isPlaying) {
      // Resume audio context if suspended
      if (globalAudioContext?.state === 'suspended') {
        globalAudioContext.resume();
      }

      const hasValidSource =
        currentElement.src &&
        currentElement.src !== window.location.href &&
        !currentElement.src.endsWith('/');
      const isReady =
        currentElement.readyState >= HTMLMediaElement.HAVE_FUTURE_DATA;

      if (hasValidSource && isReady) {
        currentElement.play().catch((err) => {
          if (err.name !== 'AbortError') {
            console.error('Play failed:', err);
            if (err.name === 'NotAllowedError') {
              setIsPlaying(false);
            }
          }
        });
      }

      // Also resume next element if crossfading
      if (crossfadeContext?.isActive) {
        const nextElement = getNextElement();
        nextElement?.play().catch(console.error);
      }

      if ('mediaSession' in navigator) {
        navigator.mediaSession.playbackState = 'playing';
      }
    } else {
      currentElement.pause();

      // Also pause next element if crossfading
      if (crossfadeContext?.isActive) {
        const nextElement = getNextElement();
        nextElement?.pause();
      }

      if ('mediaSession' in navigator) {
        navigator.mediaSession.playbackState = 'paused';
      }
    }
  }, [isPlaying, currentTrack, setIsPlaying]);

  // --------------------------------------------------------------------------
  // Handle volume changes
  // --------------------------------------------------------------------------
  useEffect(() => {
    if (globalMasterGain) {
      globalMasterGain.gain.value = volume;
    }
  }, [volume]);

  // --------------------------------------------------------------------------
  // Time update loop with crossfade trigger
  // --------------------------------------------------------------------------
  useEffect(() => {
    const updateTime = () => {
      const currentElement = getCurrentElement();
      if (!currentElement || !isPlaying) return;

      const currentTime = currentElement.currentTime;
      const duration = currentElement.duration;

      setCurrentTime(currentTime);

      // Update media session position
      if (
        'mediaSession' in navigator &&
        'setPositionState' in navigator.mediaSession
      ) {
        try {
          navigator.mediaSession.setPositionState({
            duration: duration || 0,
            playbackRate: 1,
            position: currentTime,
          });
        } catch {
          /* mediaSession not fully supported */
        }
      }

      // Check if we should preload/crossfade
      const timeRemaining = duration - currentTime;
      const nextTrack = getNextTrack();
      const hasNextTrack = nextTrack !== null;
      const effectiveCrossfade = crossfadeEnabled ? crossfadeDuration : 0;

      // Preload threshold: crossfade duration + 3 seconds buffer
      const preloadThreshold = effectiveCrossfade + 3;

      // Start preloading when we hit the threshold
      if (
        hasNextTrack &&
        crossfadeState === 'idle' &&
        timeRemaining <= preloadThreshold &&
        timeRemaining > effectiveCrossfade
      ) {
        setCrossfadeState('preloading');
        preloadNextTrack(nextTrack.id).then((success) => {
          if (success) {
            setNextTrackPreloaded(true);
          } else {
            setCrossfadeState('idle');
          }
        });
      }

      // Start crossfade when we hit crossfade duration
      if (
        hasNextTrack &&
        nextTrackPreloaded &&
        crossfadeState === 'preloading' &&
        timeRemaining <= effectiveCrossfade &&
        timeRemaining > 0.1 // Small buffer to avoid edge case
      ) {
        setCrossfadeState('crossfading');
        executeCrossfade(effectiveCrossfade, nextTrack);
      }

      animationFrameRef.current = requestAnimationFrame(updateTime);
    };

    if (isPlaying) {
      animationFrameRef.current = requestAnimationFrame(updateTime);
    }

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [
    isPlaying,
    setCurrentTime,
    crossfadeState,
    nextTrackPreloaded,
    crossfadeEnabled,
    crossfadeDuration,
    getNextTrack,
    setCrossfadeState,
    setNextTrackPreloaded,
    preloadNextTrack,
    executeCrossfade,
  ]);

  // --------------------------------------------------------------------------
  // Get audio context and output node for WebRTC
  // --------------------------------------------------------------------------
  const getContext = useCallback((): AudioContext | null => {
    return globalAudioContext;
  }, []);

  const getOutputNode = useCallback((): AudioNode | null => {
    return globalAnalyser;
  }, []);

  return {
    seek,
    togglePlayPause,
    getContext,
    getOutputNode,
    cancelCrossfade,
  };
}
