/**
 * Timeline Browser - Visualize tracks by release year.
 *
 * Shows a horizontal timeline with tracks grouped by year.
 * Click a year to filter, hover for details.
 * Uses aggregated endpoint for efficient display of large libraries.
 */
import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Calendar, Loader2 } from 'lucide-react';
import { libraryApi, type YearCount } from '../../../api/client';
import { registerBrowser, type BrowserProps } from '../types';

// Register this browser
registerBrowser(
  {
    id: 'timeline',
    name: 'Timeline',
    description: 'Browse your library by release year',
    icon: 'Calendar',
    category: 'temporal',
    requiresFeatures: false,
    requiresEmbeddings: false,
  },
  Timeline
);

export function Timeline({ onGoToYear, onGoToYearRange }: BrowserProps) {
  const [hoveredYear, setHoveredYear] = useState<number | null>(null);

  // Fetch year distribution from aggregated endpoint
  const { data, isLoading, error } = useQuery({
    queryKey: ['library-year-distribution'],
    queryFn: () => libraryApi.getYearDistribution(),
  });

  // Calculate timeline range
  const { yearData, minYear, maxYear, maxCount, totalTracks } = useMemo(() => {
    const years: YearCount[] = data?.years ?? [];
    if (years.length === 0) {
      return { yearData: years, minYear: 1960, maxYear: 2025, maxCount: 1, totalTracks: 0 };
    }
    const counts = years.map((d) => d.track_count);
    return {
      yearData: years,
      minYear: data?.min_year ?? years[0].year,
      maxYear: data?.max_year ?? years[years.length - 1].year,
      maxCount: Math.max(...counts),
      totalTracks: years.reduce((sum, d) => sum + d.track_count, 0),
    };
  }, [data]);

  // Generate decade markers
  const decades = useMemo(() => {
    const result: number[] = [];
    const startDecade = Math.floor(minYear / 10) * 10;
    const endDecade = Math.ceil(maxYear / 10) * 10;
    for (let d = startDecade; d <= endDecade; d += 10) {
      result.push(d);
    }
    return result;
  }, [minYear, maxYear]);

  const handleYearClick = (year: number) => {
    // Navigate to track list filtered by this year
    onGoToYear(year);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-zinc-400" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-red-500">Error loading timeline data</div>
      </div>
    );
  }

  if (yearData.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-zinc-500">
        <Calendar className="w-12 h-12 mb-4 opacity-50" />
        <p>No tracks with year information</p>
        <p className="text-sm mt-1">Add year metadata to your tracks to see them here</p>
      </div>
    );
  }

  const timelineWidth = 800;
  const timelineHeight = 200;
  const padding = { left: 40, right: 40, top: 40, bottom: 60 };
  const chartWidth = timelineWidth - padding.left - padding.right;
  const chartHeight = timelineHeight - padding.top - padding.bottom;

  const getX = (year: number) => {
    const range = maxYear - minYear || 1;
    return padding.left + ((year - minYear) / range) * chartWidth;
  };

  const getBarHeight = (count: number) => {
    return (count / maxCount) * chartHeight;
  };

  return (
    <div className="p-4">
      {/* Stats */}
      <div className="flex items-center gap-4 mb-6 text-sm text-zinc-400">
        <span>{totalTracks.toLocaleString()} tracks with year data</span>
        {data?.total_without_year ? (
          <span className="text-zinc-500">
            ({data.total_without_year.toLocaleString()} without)
          </span>
        ) : null}
        <span>|</span>
        <span>
          {minYear} - {maxYear}
        </span>
        <span className="text-zinc-500">Click a year to view tracks</span>
      </div>

      {/* Timeline SVG */}
      <div className="overflow-x-auto">
        <svg
          width={timelineWidth}
          height={timelineHeight}
          className="mx-auto"
          style={{ minWidth: timelineWidth }}
        >
          {/* Background grid - decades */}
          {decades.map((decade) => (
            <g key={decade}>
              <line
                x1={getX(decade)}
                y1={padding.top}
                x2={getX(decade)}
                y2={timelineHeight - padding.bottom}
                stroke="#333"
                strokeDasharray="2,4"
              />
              <text
                x={getX(decade)}
                y={timelineHeight - padding.bottom + 20}
                textAnchor="middle"
                className="fill-zinc-500 text-xs"
              >
                {decade}
              </text>
            </g>
          ))}

          {/* Axis line */}
          <line
            x1={padding.left}
            y1={timelineHeight - padding.bottom}
            x2={timelineWidth - padding.right}
            y2={timelineHeight - padding.bottom}
            stroke="#444"
            strokeWidth={2}
          />

          {/* Bars for each year */}
          {yearData.map((d) => {
            const x = getX(d.year);
            const barHeight = getBarHeight(d.track_count);
            const barWidth = Math.max(8, chartWidth / (maxYear - minYear + 1) - 2);
            const isHovered = hoveredYear === d.year;

            return (
              <g
                key={d.year}
                onMouseEnter={() => setHoveredYear(d.year)}
                onMouseLeave={() => setHoveredYear(null)}
                onClick={() => handleYearClick(d.year)}
                className="cursor-pointer"
              >
                {/* Bar */}
                <rect
                  x={x - barWidth / 2}
                  y={timelineHeight - padding.bottom - barHeight}
                  width={barWidth}
                  height={barHeight}
                  rx={2}
                  className={`transition-all ${
                    isHovered
                      ? 'fill-purple-500'
                      : 'fill-zinc-600 hover:fill-zinc-500'
                  }`}
                />

                {/* Year label (show on hover or if few years) */}
                {(isHovered || yearData.length <= 20) && (
                  <text
                    x={x}
                    y={timelineHeight - padding.bottom + 35}
                    textAnchor="middle"
                    className={`text-xs ${isHovered ? 'fill-white' : 'fill-zinc-500'}`}
                  >
                    {d.year}
                  </text>
                )}

                {/* Count label on hover */}
                {isHovered && (
                  <text
                    x={x}
                    y={timelineHeight - padding.bottom - barHeight - 8}
                    textAnchor="middle"
                    className="fill-white text-xs font-medium"
                  >
                    {d.track_count}
                  </text>
                )}
              </g>
            );
          })}
        </svg>
      </div>

      {/* Hover tooltip */}
      {hoveredYear && (
        <div className="mt-4 p-3 bg-zinc-800 rounded-lg max-w-md mx-auto">
          {(() => {
            const d = yearData.find((y) => y.year === hoveredYear);
            if (!d) return null;
            return (
              <div className="text-sm">
                <div className="font-medium text-white mb-2">{d.year}</div>
                <div className="grid grid-cols-3 gap-4 text-zinc-400">
                  <div>
                    <div className="text-lg font-semibold text-white">{d.track_count}</div>
                    <div>tracks</div>
                  </div>
                  <div>
                    <div className="text-lg font-semibold text-white">{d.album_count}</div>
                    <div>albums</div>
                  </div>
                  <div>
                    <div className="text-lg font-semibold text-white">{d.artist_count}</div>
                    <div>artists</div>
                  </div>
                </div>
              </div>
            );
          })()}
        </div>
      )}

      {/* Year grid for quick selection */}
      <div className="mt-6">
        <div className="text-sm text-zinc-400 mb-2">Quick select by decade:</div>
        <div className="flex flex-wrap gap-2">
          {decades.map((decade) => {
            const decadeTracks = yearData.filter(
              (d) => d.year >= decade && d.year < decade + 10
            );
            const count = decadeTracks.reduce((sum, d) => sum + d.track_count, 0);
            if (count === 0) return null;

            return (
              <button
                key={decade}
                onClick={() => onGoToYearRange(decade, decade + 9)}
                className="px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 rounded-md text-sm transition-colors"
              >
                {decade}s
                <span className="ml-2 text-zinc-500">({count.toLocaleString()})</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
