/**
 * Visualizer types and registry.
 */
import type { ComponentType } from 'react';
import type { Track } from '../../types';
import type { LyricLine } from '../../api/client';

/**
 * Metadata about a visualizer for the picker UI.
 */
export interface VisualizerMetadata {
  id: string;
  name: string;
  description: string;
  usesMetadata: boolean; // Whether it needs track/artwork data
}

/**
 * Props passed to all visualizer components.
 */
export interface VisualizerProps {
  track: Track | null;
  artworkUrl: string | null;
  lyrics: LyricLine[] | null;
  currentTime: number;
}

/**
 * A registered visualizer with metadata and component.
 */
export interface RegisteredVisualizer {
  metadata: VisualizerMetadata;
  component: ComponentType<VisualizerProps>;
}

/**
 * Visualizer registry - maps id to visualizer info.
 */
export const visualizerRegistry: Map<string, RegisteredVisualizer> = new Map();

/**
 * Register a visualizer in the registry.
 */
export function registerVisualizer(
  metadata: VisualizerMetadata,
  component: ComponentType<VisualizerProps>
): void {
  visualizerRegistry.set(metadata.id, { metadata, component });
}

/**
 * Get all registered visualizers.
 */
export function getVisualizers(): RegisteredVisualizer[] {
  return Array.from(visualizerRegistry.values());
}

/**
 * Get a specific visualizer by ID.
 */
export function getVisualizer(id: string): RegisteredVisualizer | undefined {
  return visualizerRegistry.get(id);
}

/**
 * Default visualizer ID.
 */
export const DEFAULT_VISUALIZER_ID = 'cosmic-orb';
