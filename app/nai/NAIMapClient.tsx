'use client';

import { useState, useEffect, useRef } from 'react';

type ViewMode = 'expressed' | 'latent' | 'gap';

const MAP_STYLE = 'https://demotiles.maplibre.org/style.json';

export function NAIMapClient() {
  const [viewMode, setViewMode] = useState<ViewMode>('expressed');
  const [conflictDay, setConflictDay] = useState(1);
  const [selectedCountry, setSelectedCountry] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<{ remove: () => void } | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined' || !containerRef.current) return;
    void import('maplibre-gl/dist/maplibre-gl.css');
    import('maplibre-gl').then((maplibregl) => {
      if (!containerRef.current) return;
      const map = new maplibregl.Map({
        container: containerRef.current,
        style: MAP_STYLE,
        center: [44, 24],
        zoom: 2,
      });
      map.addControl(new maplibregl.NavigationControl(), 'bottom-right');
      mapRef.current = map;
    });
    return () => {
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, []);

  return (
    <div className="mt-6">
      <div className="mb-4 flex flex-wrap items-center gap-4">
        <span className="osint-label text-text-muted">View:</span>
        {(['expressed', 'latent', 'gap'] as const).map((m) => (
          <button
            key={m}
            onClick={() => setViewMode(m)}
            className={`rounded border px-3 py-1 font-mono text-xs uppercase ${
              viewMode === m
                ? 'border-accent-gold bg-bg-elevated text-accent-gold'
                : 'border-[var(--border)] text-text-secondary hover:text-text-primary'
            }`}
          >
            {m}
          </button>
        ))}
        <span className="osint-label text-text-muted">Conflict day:</span>
        <input
          type="range"
          min={1}
          max={30}
          value={conflictDay}
          onChange={(e) => setConflictDay(Number(e.target.value))}
          className="w-32"
        />
        <span className="font-mono text-xs">{conflictDay}</span>
      </div>
      <div
        ref={containerRef}
        className="h-[60vh] w-full rounded-lg border border-[var(--border)] bg-bg-card"
      />
      {selectedCountry && (
        <div className="mt-4 rounded-lg border border-[var(--border)] bg-bg-card p-4">
          <h3 className="font-heading font-semibold text-text-primary">{selectedCountry}</h3>
          <p className="mt-1 font-mono text-xs text-text-muted">NAI breakdown — awaiting data</p>
        </div>
      )}
    </div>
  );
}
