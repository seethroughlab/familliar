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
// Platform Detection
// ============================================================================

const isMobilePlatform = /iPad|iPhone|iPod|Android/i.test(navigator.userAgent);
const isIOS = /iPad|iPhone|iPod/i.test(navigator.userAgent);

// iOS Hybrid Mode: Switch between direct playback (background-safe) and Web Audio (visualizer)
// On iOS, we use direct playback by default, but switch to Web Audio when visualizer is visible
const useHybridMode = isIOS;

// For non-iOS mobile, use direct playback always (no hybrid switching)
const useDirectPlaybackOnly = isMobilePlatform && !isIOS;

// Desktop uses Web Audio always
const useWebAudioOnly = !isMobilePlatform;

// Log version and platform detection on load
console.log('[AudioEngine] v4 - iOS hybrid mode', {
  isIOS,
  isMobilePlatform,
  useHybridMode,
  useDirectPlaybackOnly,
  useWebAudioOnly,
});

// ============================================================================
// Hybrid Mode State
// ============================================================================

// Track whether we're currently using Web Audio or direct playback
let currentMode: 'direct' | 'webaudio' = useWebAudioOnly ? 'webaudio' : 'direct';

// Track visualizer visibility (set by VisualizerView)
let visualizerVisible = false;

// Listeners for mode changes
type ModeChangeListener = (mode: 'direct' | 'webaudio') => void;
const modeChangeListeners: Set<ModeChangeListener> = new Set();

// ============================================================================
// Exported functions
// ============================================================================

export function areAudioEffectsAvailable(): boolean {
  // Effects only work in Web Audio mode on desktop
  return useWebAudioOnly;
}

export function isVisualizerAvailable(): boolean {
  // Visualizer works on desktop always, and on iOS when in hybrid mode
  return useWebAudioOnly || useHybridMode;
}

// Called by VisualizerView when it mounts/unmounts
export function setVisualizerVisible(visible: boolean): void {
  if (visualizerVisible === visible) return;

  visualizerVisible = visible;
  console.log('[AudioEngine] Visualizer visibility changed:', visible);

  if (useHybridMode) {
    // On iOS, switch modes based on visualizer visibility
    if (visible && currentMode === 'direct') {
      switchToWebAudioMode();
    } else if (!visible && currentMode === 'webaudio') {
      switchToDirectMode();
    }
  }
}

// Subscribe to mode changes
export function onModeChange(listener: ModeChangeListener): () => void {
  modeChangeListeners.add(listener);
  return () => modeChangeListeners.delete(listener);
}

export function getCurrentMode(): 'direct' | 'webaudio' {
  return currentMode;
}

// ============================================================================
// Global Audio Graph State
// ============================================================================

let globalAudioContext: AudioContext | null = null;
let globalAnalyser: AnalyserNode | null = null;
let globalMasterGain: GainNode | null = null;
let globalEffectsChain: EffectsChain | null = null;

// Web Audio elements (connected via createMediaElementSource)
let webAudioElementA: HTMLAudioElement | null = null;
let webAudioElementB: HTMLAudioElement | null = null;
let globalMediaSourceA: MediaElementAudioSourceNode | null = null;
let globalMediaSourceB: MediaElementAudioSourceNode | null = null;
let globalGainA: GainNode | null = null;
let globalGainB: GainNode | null = null;

// Direct playback elements (NOT connected to Web Audio - for background playback)
let directElementA: HTMLAudioElement | null = null;
let directElementB: HTMLAudioElement | null = null;

// Track which element pair is currently playing (A or B for crossfade)
let currentElementIsA = true;

// Crossfade state
interface CrossfadeContext {
  isActive: boolean;
  startTime: number;
  duration: number;
  timeoutId: ReturnType<typeof setTimeout> | null;
  animationFrameId?: number;
}
let crossfadeContext: CrossfadeContext | null = null;

// Offline URL tracking
let currentOfflineUrl: string | null = null;
let nextOfflineUrl: string | null = null;

// Current master volume
let currentMasterVolume = 1;

// ============================================================================
// Exported functions for visualizer access
// ============================================================================

export function getAudioAnalyser(): AnalyserNode | null {
  return globalAnalyser;
}

export function getAudioContext(): AudioContext | null {
  return globalAudioContext;
}

export function getAudioEffectsChain(): EffectsChain | null {
  return useWebAudioOnly ? globalEffectsChain : null;
}

// ============================================================================
// Element Accessors (mode-aware)
// ============================================================================

function getCurrentElement(): HTMLAudioElement | null {
  if (currentMode === 'webaudio') {
    return currentElementIsA ? webAudioElementA : webAudioElementB;
  } else {
    return currentElementIsA ? directElementA : directElementB;
  }
}

function getNextElement(): HTMLAudioElement | null {
  if (currentMode === 'webaudio') {
    return currentElementIsA ? webAudioElementB : webAudioElementA;
  } else {
    return currentElementIsA ? directElementB : directElementA;
  }
}

function getCurrentGain(): GainNode | null {
  if (currentMode !== 'webaudio') return null;
  return currentElementIsA ? globalGainA : globalGainB;
}

function getNextGain(): GainNode | null {
  if (currentMode !== 'webaudio') return null;
  return currentElementIsA ? globalGainB : globalGainA;
}

// ============================================================================
// Audio Graph Initialization
// ============================================================================

function createAudioElement(): HTMLAudioElement {
  const el = new Audio();
  el.preload = 'auto';
  el.crossOrigin = 'anonymous';
  el.style.display = 'none';
  document.body.appendChild(el);
  return el;
}

function initializeAudioGraph(): boolean {
  try {
    // Always create direct playback elements (for background playback on mobile)
    if (!directElementA) {
      directElementA = createAudioElement();
    }
    if (!directElementB) {
      directElementB = createAudioElement();
    }

    // Create Web Audio graph if needed (desktop or iOS hybrid mode)
    if (useWebAudioOnly || useHybridMode) {
      if (!globalAudioContext) {
        globalAudioContext = new AudioContext();
      }

      if (!globalAnalyser) {
        globalAnalyser = globalAudioContext.createAnalyser();
        globalAnalyser.fftSize = 256;
        globalAnalyser.smoothingTimeConstant = 0.8;
      }

      // Create separate elements for Web Audio (these get bound permanently)
      if (!webAudioElementA) {
        webAudioElementA = createAudioElement();
        globalMediaSourceA = globalAudioContext.createMediaElementSource(webAudioElementA);
      }
      if (!webAudioElementB) {
        webAudioElementB = createAudioElement();
        globalMediaSourceB = globalAudioContext.createMediaElementSource(webAudioElementB);
      }

      // Create gain nodes
      if (!globalGainA) {
        globalGainA = globalAudioContext.createGain();
        globalGainA.gain.value = 1;
      }
      if (!globalGainB) {
        globalGainB = globalAudioContext.createGain();
        globalGainB.gain.value = 0;
      }

      if (!globalMasterGain) {
        globalMasterGain = globalAudioContext.createGain();
      }

      // Create effects chain (desktop only)
      if (useWebAudioOnly && !globalEffectsChain) {
        globalEffectsChain = initEffectsChain(globalAudioContext);
      }

      // Connect the Web Audio graph
      globalMediaSourceA!.connect(globalGainA);
      globalMediaSourceB!.connect(globalGainB);
      globalGainA.connect(globalMasterGain);
      globalGainB.connect(globalMasterGain);

      if (globalEffectsChain) {
        globalMasterGain.connect(globalEffectsChain.input);
        globalEffectsChain.output.connect(globalAnalyser);
      } else {
        globalMasterGain.connect(globalAnalyser);
      }
      globalAnalyser.connect(globalAudioContext.destination);
    }

    console.log('[AudioEngine] Initialized, starting in mode:', currentMode);
    return true;
  } catch (e) {
    console.error('Failed to initialize audio graph:', e);
    return false;
  }
}

// ============================================================================
// Mode Switching (iOS Hybrid Mode)
// ============================================================================

function switchToWebAudioMode(): void {
  if (currentMode === 'webaudio') return;
  if (!webAudioElementA || !webAudioElementB) return;

  console.log('[AudioEngine] Switching to Web Audio mode (visualizer)');

  const directElement = getCurrentElement();
  const wasPlaying = directElement && !directElement.paused;
  const currentTime = directElement?.currentTime ?? 0;
  const src = directElement?.src ?? '';

  // Pause direct element
  if (directElement) {
    directElement.pause();
  }

  // Switch mode
  currentMode = 'webaudio';

  // Resume AudioContext if suspended
  if (globalAudioContext?.state === 'suspended') {
    globalAudioContext.resume();
  }

  // Transfer playback to Web Audio element
  const webAudioElement = getCurrentElement();
  if (webAudioElement && src) {
    webAudioElement.src = src;
    webAudioElement.currentTime = currentTime;
    if (wasPlaying) {
      webAudioElement.play().catch(console.error);
    }
  }

  // Notify listeners
  modeChangeListeners.forEach(listener => listener('webaudio'));
}

function switchToDirectMode(): void {
  if (currentMode === 'direct') return;
  if (!directElementA || !directElementB) return;

  console.log('[AudioEngine] Switching to direct mode (background-safe)');

  const webAudioElement = getCurrentElement();
  const wasPlaying = webAudioElement && !webAudioElement.paused;
  const currentTime = webAudioElement?.currentTime ?? 0;
  const src = webAudioElement?.src ?? '';

  // Pause Web Audio element
  if (webAudioElement) {
    webAudioElement.pause();
  }

  // Switch mode
  currentMode = 'direct';

  // Transfer playback to direct element
  const directElement = getCurrentElement();
  if (directElement && src) {
    directElement.src = src;
    directElement.currentTime = currentTime;
    directElement.volume = currentMasterVolume;
    if (wasPlaying) {
      directElement.play().catch(console.error);
    }
  }

  // Notify listeners
  modeChangeListeners.forEach(listener => listener('direct'));
}

// Handle visibility change - switch to direct mode when backgrounded
function handleVisibilityChange(): void {
  const currentElement = getCurrentElement();
  console.log('[AudioEngine] Visibility changed:', {
    hidden: document.hidden,
    visibilityState: document.visibilityState,
    currentMode,
    visualizerVisible,
    isPlaying: usePlayerStore.getState().isPlaying,
    audioPaused: currentElement?.paused,
  });

  if (useHybridMode && document.hidden && currentMode === 'webaudio') {
    // App went to background while in Web Audio mode - switch to direct for background playback
    switchToDirectMode();
  }
}

// ============================================================================
// Helper Functions
// ============================================================================

async function getTrackUrl(trackId: string): Promise<{ url: string; isOffline: boolean }> {
  const offlineBlob = await getOfflineTrack(trackId);
  if (offlineBlob) {
    return { url: createOfflineTrackUrl(offlineBlob), isOffline: true };
  }
  return { url: tracksApi.getStreamUrl(trackId), isOffline: false };
}

function cleanupElement(element: HTMLAudioElement | null, offlineUrl: string | null): void {
  if (element) {
    element.pause();
    element.currentTime = 0;
    element.src = '';
    element.load();
  }
  if (offlineUrl) {
    revokeOfflineTrackUrl(offlineUrl);
  }
}

function setElementVolume(element: HTMLAudioElement | null, volume: number): void {
  if (element) {
    element.volume = Math.max(0, Math.min(1, volume));
  }
}

function updateDirectPlaybackVolumes(): void {
  if (currentMode !== 'direct') return;
  if (!crossfadeContext?.isActive) {
    const currentElement = getCurrentElement();
    const nextElement = getNextElement();
    setElementVolume(currentElement, currentMasterVolume);
    setElementVolume(nextElement, 0);
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
  const preloadNextTrack = useCallback(async (trackId: string): Promise<boolean> => {
    if (preloadingTrackIdRef.current === trackId) return false;

    preloadingTrackIdRef.current = trackId;
    const nextElement = getNextElement();
    if (!nextElement) return false;

    try {
      if (nextOfflineUrl) {
        revokeOfflineTrackUrl(nextOfflineUrl);
        nextOfflineUrl = null;
      }

      const { url, isOffline } = await getTrackUrl(trackId);
      if (isOffline) nextOfflineUrl = url;

      nextElement.src = url;
      nextElement.load();

      return new Promise((resolve) => {
        const cleanup = () => {
          clearTimeout(timeout);
          nextElement.removeEventListener('canplay', onCanPlay);
          nextElement.removeEventListener('error', onError);
        };

        const timeout = setTimeout(() => {
          cleanup();
          preloadingTrackIdRef.current = null;
          resolve(false);
        }, 10000);

        const onCanPlay = () => {
          cleanup();
          preloadingTrackIdRef.current = null;
          resolve(true);
        };
        const onError = () => {
          cleanup();
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
  }, []);

  // --------------------------------------------------------------------------
  // Execute crossfade
  // --------------------------------------------------------------------------
  const executeCrossfade = useCallback((duration: number, nextTrack: Track) => {
    const currentElement = getCurrentElement();
    const nextElement = getNextElement();
    if (!nextElement) return;

    if (currentMode === 'direct') {
      // Direct mode: animate audioElement.volume
      const startTime = performance.now();
      const durationMs = duration * 1000;

      nextElement.volume = 0;
      nextElement.play().catch(console.error);

      const animateCrossfade = () => {
        const elapsed = performance.now() - startTime;
        const progress = Math.min(elapsed / durationMs, 1);
        const currentVol = (1 - progress) * currentMasterVolume;
        const nextVol = progress * currentMasterVolume;

        if (currentElement) currentElement.volume = currentVol;
        nextElement.volume = nextVol;

        if (progress < 1) {
          crossfadeContext!.animationFrameId = requestAnimationFrame(animateCrossfade);
        } else {
          completeCrossfade();
        }
      };

      crossfadeContext = {
        isActive: true,
        startTime: performance.now(),
        duration,
        timeoutId: null,
        animationFrameId: requestAnimationFrame(animateCrossfade),
      };
    } else {
      // Web Audio mode: use gain nodes
      if (!globalAudioContext || !globalMasterGain) return;
      const currentGain = getCurrentGain();
      const nextGain = getNextGain();
      if (!currentGain || !nextGain) return;

      const ctx = globalAudioContext;
      const now = ctx.currentTime;

      currentGain.gain.cancelScheduledValues(now);
      nextGain.gain.cancelScheduledValues(now);

      if (duration === 0) {
        currentGain.gain.setValueAtTime(0, now);
        nextGain.gain.setValueAtTime(1, now);
        nextElement.play().catch(console.error);
      } else {
        currentGain.gain.setValueAtTime(1, now);
        currentGain.gain.linearRampToValueAtTime(0, now + duration);
        nextGain.gain.setValueAtTime(0, now);
        nextGain.gain.linearRampToValueAtTime(1, now + duration);
        nextElement.play().catch(console.error);
      }

      crossfadeContext = {
        isActive: true,
        startTime: now,
        duration,
        timeoutId: setTimeout(() => completeCrossfade(), duration * 1000),
      };
    }

    loadedTrackIdRef.current = nextTrack.id;
    advanceToNextTrack(nextTrack);
  }, [advanceToNextTrack]);

  // --------------------------------------------------------------------------
  // Complete crossfade
  // --------------------------------------------------------------------------
  const completeCrossfade = useCallback(() => {
    const oldElement = getCurrentElement();
    cleanupElement(oldElement, currentOfflineUrl);

    currentOfflineUrl = nextOfflineUrl;
    nextOfflineUrl = null;
    currentElementIsA = !currentElementIsA;

    if (crossfadeContext?.timeoutId) clearTimeout(crossfadeContext.timeoutId);
    if (crossfadeContext?.animationFrameId) cancelAnimationFrame(crossfadeContext.animationFrameId);
    crossfadeContext = null;

    preloadingTrackIdRef.current = null;

    const currentId = usePlayerStore.getState().currentTrack?.id;
    if (currentId) loadedTrackIdRef.current = currentId;

    if (currentMode === 'direct') {
      const newCurrentElement = getCurrentElement();
      const newNextElement = getNextElement();
      setElementVolume(newCurrentElement, currentMasterVolume);
      setElementVolume(newNextElement, 0);
    }

    setCrossfadeState('idle');
    setNextTrackPreloaded(false);
  }, [setCrossfadeState, setNextTrackPreloaded]);

  // --------------------------------------------------------------------------
  // Cancel crossfade
  // --------------------------------------------------------------------------
  const cancelCrossfade = useCallback(() => {
    if (!crossfadeContext) return;

    const currentElement = getCurrentElement();
    const nextElement = getNextElement();

    if (currentMode === 'direct') {
      if (crossfadeContext.animationFrameId) cancelAnimationFrame(crossfadeContext.animationFrameId);
      setElementVolume(currentElement, currentMasterVolume);
      setElementVolume(nextElement, 0);
    } else {
      if (globalAudioContext) {
        const now = globalAudioContext.currentTime;
        const currentGain = getCurrentGain();
        const nextGain = getNextGain();
        currentGain?.gain.cancelScheduledValues(now);
        nextGain?.gain.cancelScheduledValues(now);
        currentGain?.gain.setValueAtTime(1, now);
        nextGain?.gain.setValueAtTime(0, now);
      }
    }

    cleanupElement(nextElement, nextOfflineUrl);
    nextOfflineUrl = null;

    if (crossfadeContext.timeoutId) clearTimeout(crossfadeContext.timeoutId);
    crossfadeContext = null;

    preloadingTrackIdRef.current = null;
    setCrossfadeState('idle');
    setNextTrackPreloaded(false);
  }, [setCrossfadeState, setNextTrackPreloaded]);

  // --------------------------------------------------------------------------
  // Update Media Session
  // --------------------------------------------------------------------------
  const updateMediaSession = useCallback(() => {
    if (!('mediaSession' in navigator) || !currentTrack) return;

    navigator.mediaSession.metadata = new MediaMetadata({
      title: currentTrack.title || 'Unknown',
      artist: currentTrack.artist || 'Unknown',
      album: currentTrack.album || 'Unknown',
      artwork: currentTrack.id ? [{ src: tracksApi.getArtworkUrl(currentTrack.id), sizes: '512x512', type: 'image/jpeg' }] : [],
    });

    navigator.mediaSession.setActionHandler('play', () => setIsPlaying(true));
    navigator.mediaSession.setActionHandler('pause', () => setIsPlaying(false));
    navigator.mediaSession.setActionHandler('nexttrack', () => playNext());
    navigator.mediaSession.setActionHandler('previoustrack', () => usePlayerStore.getState().playPrevious());
    navigator.mediaSession.setActionHandler('seekto', (details) => {
      if (details.seekTime !== undefined) seek(details.seekTime);
    });
  }, [currentTrack, setIsPlaying, playNext]);

  // --------------------------------------------------------------------------
  // Seek
  // --------------------------------------------------------------------------
  const seek = useCallback((time: number) => {
    const currentElement = getCurrentElement();
    if (!currentElement) return;

    if (crossfadeContext?.isActive) {
      const duration = currentElement.duration;
      const effectiveCrossfade = crossfadeEnabled ? crossfadeDuration : 0;
      if (duration - time > effectiveCrossfade + 1) cancelCrossfade();
    }

    currentElement.currentTime = time;
    setCurrentTime(time);
  }, [setCurrentTime, crossfadeEnabled, crossfadeDuration, cancelCrossfade]);

  // --------------------------------------------------------------------------
  // Toggle play/pause
  // --------------------------------------------------------------------------
  const togglePlayPause = useCallback(() => {
    setIsPlaying(!isPlaying);
  }, [isPlaying, setIsPlaying]);

  // --------------------------------------------------------------------------
  // Initialize
  // --------------------------------------------------------------------------
  useEffect(() => {
    initializeAudioGraph();

    document.addEventListener('visibilitychange', handleVisibilityChange);

    // Setup ended handlers for ALL elements
    const handleEnded = (isA: boolean) => () => {
      if (queueTransitionRef.current) return;
      if (currentElementIsA === isA && !crossfadeContext?.isActive) {
        playNext();
      }
    };

    const handleError = (e: Event) => {
      const target = e.target as HTMLAudioElement;
      if (!target.src || target.src === window.location.href) return;

      const currentElement = getCurrentElement();
      if (target !== currentElement) return;

      console.error('Audio error:', e);

      const currentId = usePlayerStore.getState().currentTrack?.id;
      if (currentId === lastErrorTrackRef.current) {
        errorCountRef.current++;
        if (errorCountRef.current >= 3) {
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

    const endedA = handleEnded(true);
    const endedB = handleEnded(false);

    directElementA?.addEventListener('ended', endedA);
    directElementB?.addEventListener('ended', endedB);
    webAudioElementA?.addEventListener('ended', endedA);
    webAudioElementB?.addEventListener('ended', endedB);

    directElementA?.addEventListener('error', handleError);
    directElementB?.addEventListener('error', handleError);
    webAudioElementA?.addEventListener('error', handleError);
    webAudioElementB?.addEventListener('error', handleError);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      directElementA?.removeEventListener('ended', endedA);
      directElementB?.removeEventListener('ended', endedB);
      webAudioElementA?.removeEventListener('ended', endedA);
      webAudioElementB?.removeEventListener('ended', endedB);
      directElementA?.removeEventListener('error', handleError);
      directElementB?.removeEventListener('error', handleError);
      webAudioElementA?.removeEventListener('error', handleError);
      webAudioElementB?.removeEventListener('error', handleError);
    };
  }, [playNext, setIsPlaying]);

  // --------------------------------------------------------------------------
  // Load track
  // --------------------------------------------------------------------------
  useEffect(() => {
    const currentElement = getCurrentElement();

    if (!currentTrack) {
      cleanupElement(directElementA, null);
      cleanupElement(directElementB, null);
      cleanupElement(webAudioElementA, null);
      cleanupElement(webAudioElementB, null);
      if (currentOfflineUrl) {
        revokeOfflineTrackUrl(currentOfflineUrl);
        currentOfflineUrl = null;
      }
      loadedTrackIdRef.current = null;
      return;
    }

    if (loadedTrackIdRef.current === currentTrack.id) return;
    if (crossfadeContext?.isActive) return;

    queueTransitionRef.current = true;
    isLoadingRef.current = true;
    const currentLoadId = ++loadIdRef.current;
    const trackIdToLoad = currentTrack.id;

    const loadTrack = async () => {
      if (currentOfflineUrl) {
        revokeOfflineTrackUrl(currentOfflineUrl);
        currentOfflineUrl = null;
      }

      const { url, isOffline } = await getTrackUrl(trackIdToLoad);

      if (loadIdRef.current !== currentLoadId) {
        if (isOffline) revokeOfflineTrackUrl(url);
        return;
      }

      if (isOffline) currentOfflineUrl = url;

      if (currentElement) {
        currentElement.src = url;
        currentElement.load();

        const transitionTimeout = setTimeout(() => {
          if (loadIdRef.current === currentLoadId && queueTransitionRef.current) {
            queueTransitionRef.current = false;
          }
        }, 10000);

        const playWhenReady = () => {
          if (loadIdRef.current !== currentLoadId) return;
          clearTimeout(transitionTimeout);
          queueTransitionRef.current = false;

          const shouldPlay = usePlayerStore.getState().isPlaying;
          if (shouldPlay) {
            currentElement.play().catch((err) => {
              if (err.name !== 'AbortError') console.error('Play failed:', err);
            });
          }
          currentElement.removeEventListener('canplay', playWhenReady);
        };

        const handleMetadata = () => {
          if (loadIdRef.current !== currentLoadId) return;
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
  }, [currentTrack?.id, setDuration, updateMediaSession]);

  // --------------------------------------------------------------------------
  // Play/pause
  // --------------------------------------------------------------------------
  useEffect(() => {
    if (!currentTrack) return;

    const currentElement = getCurrentElement();
    if (!currentElement) return;

    if (isPlaying) {
      if (globalAudioContext?.state === 'suspended') {
        globalAudioContext.resume();
      }

      const hasValidSource = currentElement.src && currentElement.src !== window.location.href && !currentElement.src.endsWith('/');
      const isReady = currentElement.readyState >= HTMLMediaElement.HAVE_FUTURE_DATA;

      if (hasValidSource && isReady) {
        currentElement.play().catch((err) => {
          if (err.name !== 'AbortError') {
            console.error('Play failed:', err);
            if (err.name === 'NotAllowedError') setIsPlaying(false);
          }
        });
      }

      if (crossfadeContext?.isActive) {
        getNextElement()?.play().catch(console.error);
      }

      if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'playing';
    } else {
      currentElement.pause();
      if (crossfadeContext?.isActive) getNextElement()?.pause();
      if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'paused';
    }
  }, [isPlaying, currentTrack, setIsPlaying]);

  // --------------------------------------------------------------------------
  // Volume
  // --------------------------------------------------------------------------
  useEffect(() => {
    currentMasterVolume = volume;

    if (currentMode === 'direct') {
      updateDirectPlaybackVolumes();
    } else {
      if (globalMasterGain) globalMasterGain.gain.value = volume;
    }
  }, [volume]);

  // --------------------------------------------------------------------------
  // Time update loop
  // --------------------------------------------------------------------------
  useEffect(() => {
    const updateTime = () => {
      const currentElement = getCurrentElement();
      if (!currentElement || !isPlaying) return;

      const currentTime = currentElement.currentTime;
      const duration = currentElement.duration;

      setCurrentTime(currentTime);

      if ('mediaSession' in navigator && 'setPositionState' in navigator.mediaSession) {
        try {
          navigator.mediaSession.setPositionState({ duration: duration || 0, playbackRate: 1, position: currentTime });
        } catch { /* ignore */ }
      }

      const timeRemaining = duration - currentTime;
      const nextTrack = getNextTrack();
      const hasNextTrack = nextTrack !== null;
      const effectiveCrossfade = crossfadeEnabled ? crossfadeDuration : 0;
      const preloadThreshold = effectiveCrossfade + 3;

      if (hasNextTrack && crossfadeState === 'idle' && timeRemaining <= preloadThreshold && timeRemaining > effectiveCrossfade) {
        setCrossfadeState('preloading');
        preloadNextTrack(nextTrack.id).then((success) => {
          if (success) setNextTrackPreloaded(true);
          else setCrossfadeState('idle');
        });
      }

      if (hasNextTrack && nextTrackPreloaded && crossfadeState === 'preloading' && timeRemaining <= effectiveCrossfade && timeRemaining > 0.1) {
        setCrossfadeState('crossfading');
        executeCrossfade(effectiveCrossfade, nextTrack);
      }

      animationFrameRef.current = requestAnimationFrame(updateTime);
    };

    if (isPlaying) animationFrameRef.current = requestAnimationFrame(updateTime);

    return () => {
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
    };
  }, [isPlaying, setCurrentTime, crossfadeState, nextTrackPreloaded, crossfadeEnabled, crossfadeDuration, getNextTrack, setCrossfadeState, setNextTrackPreloaded, preloadNextTrack, executeCrossfade]);

  // --------------------------------------------------------------------------
  // Return
  // --------------------------------------------------------------------------
  const getContext = useCallback(() => globalAudioContext, []);
  const getOutputNode = useCallback(() => globalAnalyser, []);

  return { seek, togglePlayPause, getContext, getOutputNode, cancelCrossfade };
}
