# Library Browser API

Create custom 2D or 3D visualizations of your music library. Browsers are pluggable React components that receive library data and can render it however you like.

## Quick Start

Create a new browser in `frontend/src/components/Library/browsers/`:

```tsx
import { useQuery } from '@tanstack/react-query';
import { libraryApi } from '../../../api/client';
import { registerBrowser, type BrowserProps } from '../types';

// Register the browser
registerBrowser(
  {
    id: 'my-browser',
    name: 'My Browser',
    description: 'A custom library visualization',
    icon: 'Sparkles',  // Lucide icon name
    category: 'spatial',
    requiresFeatures: false,
    requiresEmbeddings: false,
  },
  MyBrowser
);

export function MyBrowser({ onGoToArtist, onPlayTrack }: BrowserProps) {
  // Fetch data from the API
  const { data, isLoading } = useQuery({
    queryKey: ['my-data'],
    queryFn: () => libraryApi.getArtists(),
  });

  if (isLoading) return <div>Loading...</div>;

  return (
    <div>
      {data?.items.map((artist) => (
        <button key={artist.name} onClick={() => onGoToArtist(artist.name)}>
          {artist.name}
        </button>
      ))}
    </div>
  );
}
```

Then import your browser in `frontend/src/components/Library/browsers/index.ts`:

```tsx
import './MyBrowser';
```

That's it! Your browser will appear in the browser picker.

---

## BrowserMetadata

Metadata shown in the browser picker UI.

```typescript
interface BrowserMetadata {
  id: string;           // Unique identifier (used in URL)
  name: string;         // Display name
  description: string;  // Short description
  icon: string;         // Lucide icon name (e.g., 'Map', 'Calendar', 'Sparkles')
  category: 'traditional' | 'spatial' | 'temporal';
  requiresFeatures: boolean;    // Needs audio analysis (BPM, energy, etc.)
  requiresEmbeddings: boolean;  // Needs CLAP embeddings for similarity
}
```

**Categories:**
- `traditional` - List/grid views (track list, album grid)
- `spatial` - 2D/3D visualizations (mood grid, music map)
- `temporal` - Time-based views (timeline)

---

## BrowserProps

Props passed to every browser component.

### Data

```typescript
tracks: Track[];           // All tracks (may be filtered)
artists: ArtistSummary[];  // Aggregated artist data
albums: AlbumSummary[];    // Aggregated album data
isLoading: boolean;        // True while data is loading
filters: LibraryFilters;   // Current filter state
```

### Navigation Callbacks

Use these to navigate the user to filtered views:

```typescript
onGoToArtist(artistName: string): void
onGoToAlbum(artistName: string, albumName: string): void
onGoToYear(year: number): void
onGoToYearRange(yearFrom: number, yearTo: number): void
onGoToMood(energyMin: number, energyMax: number, valenceMin: number, valenceMax: number): void
onFilterChange(filters: Partial<LibraryFilters>): void
```

### Playback Callbacks

```typescript
onPlayTrack(trackId: string): void              // Play immediately
onPlayTrackAt(trackId: string, index: number): void  // Play at queue position
onQueueTrack(trackId: string): void             // Add to queue
```

### Selection Callbacks

For multi-select (e.g., creating playlists):

```typescript
selectedTrackIds: Set<string>
onSelectTrack(id: string, multi: boolean): void
onSelectAll(): void
onClearSelection(): void
```

---

## Data Types

### Track

```typescript
interface Track {
  id: string;
  title: string | null;
  artist: string | null;
  album: string | null;
  album_artist: string | null;
  year: number | null;
  genre: string | null;
  duration_seconds: number | null;
  track_number: number | null;
  disc_number: number | null;
  format: string | null;
  analysis_version: number;
  features?: TrackFeatures;
}
```

### TrackFeatures

Audio analysis data (available when `include_features: true`):

```typescript
interface TrackFeatures {
  bpm: number | null;
  key: string | null;
  energy: number | null;       // 0-1, calm to energetic
  valence: number | null;      // 0-1, sad to happy
  danceability: number | null; // 0-1
  acousticness: number | null; // 0-1
  instrumentalness: number | null; // 0-1
  speechiness: number | null;  // 0-1
}
```

### ArtistSummary

```typescript
interface ArtistSummary {
  name: string;
  trackCount: number;
  albumCount: number;
  firstTrackId: string;  // For artwork lookup
}
```

### AlbumSummary

```typescript
interface AlbumSummary {
  name: string;
  artist: string;
  year: number | null;
  trackCount: number;
  firstTrackId: string;  // For artwork lookup
}
```

---

## API Endpoints

These endpoints provide aggregated data for visualizations.

### Artists

```typescript
libraryApi.getArtists(params?: {
  search?: string;
  sort_by?: 'name' | 'track_count' | 'album_count';
  page?: number;
  page_size?: number;
}): Promise<{ items: ArtistSummary[]; total: number; }>
```

### Albums

```typescript
libraryApi.getAlbums(params?: {
  artist?: string;
  search?: string;
  sort_by?: 'name' | 'year' | 'track_count' | 'artist';
  page?: number;
  page_size?: number;
}): Promise<{ items: AlbumSummary[]; total: number; }>
```

### Year Distribution (Timeline)

```typescript
libraryApi.getYearDistribution(): Promise<{
  years: YearCount[];
  total_with_year: number;
  total_without_year: number;
  min_year: number | null;
  max_year: number | null;
}>

interface YearCount {
  year: number;
  track_count: number;
  album_count: number;
  artist_count: number;
}
```

### Mood Distribution (Mood Grid)

```typescript
libraryApi.getMoodDistribution(gridSize?: number): Promise<{
  cells: MoodCell[];
  grid_size: number;
  total_with_mood: number;
  total_without_mood: number;
}>

interface MoodCell {
  energy_min: number;
  energy_max: number;
  valence_min: number;
  valence_max: number;
  track_count: number;
  sample_track_ids: string[];
}
```

### Music Map (Similarity)

```typescript
libraryApi.getMusicMap(params?: {
  entity_type?: 'artists' | 'albums';
  limit?: number;  // max 500
}): Promise<{
  nodes: MapNode[];
  edges: MapEdge[];
  entity_type: string;
  total_entities: number;
}>

interface MapNode {
  id: string;
  name: string;
  x: number;  // 0-1 normalized
  y: number;  // 0-1 normalized
  track_count: number;
  first_track_id: string;
}

interface MapEdge {
  source: string;
  target: string;
  weight: number;  // similarity 0-1
}
```

### Tracks

```typescript
tracksApi.list(params?: {
  search?: string;
  artist?: string;
  album?: string;
  year_from?: number;
  year_to?: number;
  energy_min?: number;
  energy_max?: number;
  valence_min?: number;
  valence_max?: number;
  include_features?: boolean;
  page?: number;
  page_size?: number;
}): Promise<{ items: Track[]; total: number; }>
```

### Artwork URL

```typescript
tracksApi.getArtworkUrl(trackId: string, size?: 'full' | 'thumb'): string
```

---

## Example: 3D Browser with Three.js

Here's a skeleton for a 3D browser using Three.js:

```tsx
import { useRef, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import * as THREE from 'three';
import { libraryApi } from '../../../api/client';
import { registerBrowser, type BrowserProps } from '../types';

registerBrowser(
  {
    id: 'music-galaxy',
    name: 'Music Galaxy',
    description: '3D galaxy of artists',
    icon: 'Globe',
    category: 'spatial',
    requiresFeatures: false,
    requiresEmbeddings: true,  // Needs embeddings for positioning
  },
  MusicGalaxy
);

export function MusicGalaxy({ onGoToArtist }: BrowserProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  const { data } = useQuery({
    queryKey: ['music-map-3d'],
    queryFn: () => libraryApi.getMusicMap({ entity_type: 'artists', limit: 200 }),
  });

  useEffect(() => {
    if (!containerRef.current || !data) return;

    // Set up Three.js scene
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(75, 800 / 600, 0.1, 1000);
    const renderer = new THREE.WebGLRenderer();
    renderer.setSize(800, 600);
    containerRef.current.appendChild(renderer.domElement);

    // Create spheres for each artist
    data.nodes.forEach((node) => {
      const geometry = new THREE.SphereGeometry(0.1 + node.track_count / 100);
      const material = new THREE.MeshBasicMaterial({ color: 0xa855f7 });
      const sphere = new THREE.Mesh(geometry, material);

      // Position using x, y from API, add random z for depth
      sphere.position.set(
        (node.x - 0.5) * 10,
        (node.y - 0.5) * 10,
        Math.random() * 5 - 2.5
      );
      sphere.userData = { artistName: node.name };
      scene.add(sphere);
    });

    camera.position.z = 15;

    // Animation loop
    const animate = () => {
      requestAnimationFrame(animate);
      scene.rotation.y += 0.001;
      renderer.render(scene, camera);
    };
    animate();

    // Cleanup
    return () => {
      renderer.dispose();
      containerRef.current?.removeChild(renderer.domElement);
    };
  }, [data]);

  return <div ref={containerRef} className="w-full h-full" />;
}
```

---

## Existing Browsers

| Browser | Description | Data Source |
|---------|-------------|-------------|
| `TrackListBrowser` | Traditional sortable track list | `tracksApi.list()` |
| `ArtistList` | Artist cards with album counts | `libraryApi.getArtists()` |
| `AlbumGrid` | Album artwork grid | `libraryApi.getAlbums()` |
| `Timeline` | Bar chart by release year | `libraryApi.getYearDistribution()` |
| `MoodGrid` | Energy × Valence heatmap | `libraryApi.getMoodDistribution()` |
| `MusicMap` | UMAP similarity visualization | `libraryApi.getMusicMap()` |

---

## Tips

1. **Use aggregated endpoints** - Don't fetch all tracks for visualizations. Use the aggregated endpoints (`getYearDistribution`, `getMoodDistribution`, `getMusicMap`) which are optimized for large libraries.

2. **Cache expensive computations** - Use React Query's `staleTime` for data that doesn't change often:
   ```typescript
   useQuery({
     queryKey: ['music-map'],
     queryFn: () => libraryApi.getMusicMap(),
     staleTime: 5 * 60 * 1000,  // Cache for 5 minutes
   });
   ```

3. **Handle loading and error states** - Always show feedback while data loads.

4. **Use navigation callbacks** - When the user clicks on something, navigate them to a filtered view using `onGoToArtist`, `onGoToMood`, etc.

5. **Support pan/zoom for spatial views** - See MoodGrid and MusicMap for examples of SVG-based pan/zoom.

6. **Get artwork** - Use `tracksApi.getArtworkUrl(firstTrackId, 'thumb')` to show album art for any entity.
