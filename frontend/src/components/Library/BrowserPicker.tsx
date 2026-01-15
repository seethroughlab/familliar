/**
 * Browser Picker Component.
 *
 * Dropdown for selecting between different library browser views.
 */
import { useState, useRef, useEffect } from 'react';
import {
  ChevronDown,
  List,
  Users,
  Grid3X3,
  Calendar,
  Smile,
  Map,
  Activity,
  Sparkles,
} from 'lucide-react';
import { getBrowsers, getBrowsersByCategory, type BrowserMetadata } from './types';

// Icon mapping for browsers by ID
const browserIcons: Record<string, typeof List> = {
  'track-list': List,
  'artist-list': Users,
  'album-grid': Grid3X3,
  'timeline': Calendar,
  'mood-grid': Smile,
  'music-map': Map,
  'tempo-spectrum': Activity,
  'discover': Sparkles,
};

// Category labels
const categoryLabels: Record<BrowserMetadata['category'], string> = {
  traditional: 'Traditional Views',
  temporal: 'Timeline Views',
  spatial: 'Spatial Views',
  discovery: 'Discovery',
};

interface BrowserPickerProps {
  currentBrowserId: string;
  onSelectBrowser: (id: string) => void;
}

export function BrowserPicker({
  currentBrowserId,
  onSelectBrowser,
}: BrowserPickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const browsers = getBrowsers();
  const currentBrowser = browsers.find((b) => b.metadata.id === currentBrowserId);

  // Close on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isOpen]);

  // Close on escape
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsOpen(false);
    };

    if (isOpen) {
      document.addEventListener('keydown', handleEscape);
      return () => document.removeEventListener('keydown', handleEscape);
    }
  }, [isOpen]);

  const handleSelect = (id: string) => {
    onSelectBrowser(id);
    setIsOpen(false);
  };

  // Get current browser icon (using stable reference from the map)
  const currentIconId = currentBrowser?.metadata.id || 'track-list';
  const CurrentIcon = browserIcons[currentIconId] || List;

  // Group browsers by category
  const categories: BrowserMetadata['category'][] = ['traditional', 'temporal', 'spatial'];

  return (
    <div ref={containerRef} className="relative">
      {/* Trigger button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`flex items-center gap-2 px-3 py-2 rounded-lg transition-colors ${
          isOpen
            ? 'bg-zinc-700 text-white'
            : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700 hover:text-white'
        }`}
      >
        <CurrentIcon className="w-4 h-4" />
        <span className="text-sm font-medium">
          {currentBrowser?.metadata.name || 'View'}
        </span>
        <ChevronDown
          className={`w-4 h-4 transition-transform ${isOpen ? 'rotate-180' : ''}`}
        />
      </button>

      {/* Dropdown */}
      {isOpen && (
        <div className="absolute top-full left-0 mt-2 w-72 bg-zinc-900 border border-zinc-700 rounded-lg shadow-xl z-50 overflow-hidden">
          <div className="max-h-96 overflow-y-auto">
            {categories.map((category) => {
              const categoryBrowsers = getBrowsersByCategory(category);
              if (categoryBrowsers.length === 0) return null;

              return (
                <div key={category}>
                  {/* Category header */}
                  <div className="px-3 py-2 border-b border-zinc-800 bg-zinc-800/50">
                    <span className="text-xs text-zinc-500 uppercase tracking-wide">
                      {categoryLabels[category]}
                    </span>
                  </div>

                  {/* Browsers in category */}
                  {categoryBrowsers.map(({ metadata }) => {
                    const Icon = browserIcons[metadata.id] || List;
                    const isSelected = metadata.id === currentBrowserId;

                    return (
                      <button
                        key={metadata.id}
                        onClick={() => handleSelect(metadata.id)}
                        className={`w-full flex items-start gap-3 p-3 text-left transition-colors ${
                          isSelected
                            ? 'bg-purple-500/20 text-white'
                            : 'text-zinc-300 hover:bg-zinc-800 hover:text-white'
                        }`}
                      >
                        <div
                          className={`p-2 rounded-lg ${
                            isSelected ? 'bg-purple-500/30' : 'bg-zinc-800'
                          }`}
                        >
                          <Icon className="w-4 h-4" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="font-medium flex items-center gap-2">
                            {metadata.name}
                            {metadata.requiresFeatures && (
                              <span className="text-[10px] px-1.5 py-0.5 bg-cyan-500/30 text-cyan-300 rounded">
                                FEATURES
                              </span>
                            )}
                            {metadata.requiresEmbeddings && (
                              <span className="text-[10px] px-1.5 py-0.5 bg-purple-500/30 text-purple-300 rounded">
                                AI
                              </span>
                            )}
                          </div>
                          <div className="text-xs text-zinc-500 mt-0.5">
                            {metadata.description}
                          </div>
                        </div>
                        {isSelected && (
                          <div className="w-2 h-2 rounded-full bg-purple-500 mt-2" />
                        )}
                      </button>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
