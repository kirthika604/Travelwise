"use client";

import { useEffect, useRef } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { MAP_STYLE, CHENNAI_CENTER } from "@/lib/constants";

export interface PassportPlace {
  id: number;
  name: string;
  latitude: number;
  longitude: number;
  visited: boolean;
  // Only present for visited places — the memory itself, shown on click.
  category?: string;
  note?: string;
  photoDataUrl?: string | null;
  createdAt?: string;
}

export interface PathPoint {
  latitude: number;
  longitude: number;
}

// "Fog of war" city map — unvisited places sit as dim grey dots, visited ones
// light up with a glowing marker + soft reveal halo, connected by a path line
// in the order they were actually visited — so "how much distance covered"
// is something you can see, not just a number in a stat card. Reuses the
// exact MapLibre mount/cleanup/style pattern from components/routes/RouteMap.tsx.
export default function PassportMap({
  places,
  path,
  className,
  onSelectMemory,
}: {
  places: PassportPlace[];
  path?: PathPoint[];
  className?: string;
  // Fired when a visited (has-a-memory) marker is clicked, so the caller can
  // open a detail view with the photo/note — hover/tap on any marker still
  // just shows its name, that's a separate, lighter-weight popup.
  onSelectMemory?: (place: PassportPlace) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markersRef = useRef<maplibregl.Marker[]>([]);
  const onSelectMemoryRef = useRef(onSelectMemory);
  onSelectMemoryRef.current = onSelectMemory;

  const sig = JSON.stringify({ places: places.map((p) => [p.id, p.visited]), path });

  // create map once
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: MAP_STYLE,
      center: [CHENNAI_CENTER.longitude, CHENNAI_CENTER.latitude],
      zoom: 10.5,
      attributionControl: false,
    });
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
    map.addControl(new maplibregl.AttributionControl({ compact: true }));
    mapRef.current = map;
    return () => {
      markersRef.current.forEach((m) => m.remove());
      markersRef.current = [];
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // (re)draw markers + reveal halos whenever visited state changes
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const draw = () => {
      markersRef.current.forEach((m) => m.remove());
      markersRef.current = [];
      places.forEach((p) => {
        if (map.getLayer(`glow-${p.id}`)) map.removeLayer(`glow-${p.id}`);
        if (map.getSource(`reveal-${p.id}`)) map.removeSource(`reveal-${p.id}`);
      });
      for (const id of ["visited-path-glow", "visited-path-line"]) {
        if (map.getLayer(id)) map.removeLayer(id);
      }
      if (map.getSource("visited-path")) map.removeSource("visited-path");

      if (path && path.length >= 2) {
        map.addSource("visited-path", {
          type: "geojson",
          data: {
            type: "Feature",
            properties: {},
            geometry: { type: "LineString", coordinates: path.map((p) => [p.longitude, p.latitude]) },
          },
        });
        // soft glow casing, same treatment as RouteMap's route lines
        map.addLayer({
          id: "visited-path-glow",
          type: "line",
          source: "visited-path",
          layout: { "line-cap": "round", "line-join": "round" },
          paint: { "line-color": "#2DD4BF", "line-width": 7, "line-opacity": 0.18, "line-blur": 4 },
        });
        map.addLayer({
          id: "visited-path-line",
          type: "line",
          source: "visited-path",
          layout: { "line-cap": "round", "line-join": "round" },
          paint: { "line-color": "#2DD4BF", "line-width": 2.5, "line-dasharray": [0.5, 1.5] },
        });
      }

      places.forEach((p) => {
        if (p.visited) {
          map.addSource(`reveal-${p.id}`, {
            type: "geojson",
            data: {
              type: "Feature",
              properties: {},
              geometry: { type: "Point", coordinates: [p.longitude, p.latitude] },
            },
          });
          map.addLayer({
            id: `glow-${p.id}`,
            type: "circle",
            source: `reveal-${p.id}`,
            paint: {
              "circle-radius": 14,
              "circle-color": "#F65C6B",
              "circle-opacity": 0.16,
              "circle-blur": 1,
            },
          });
        }

        // Only visited ("just visited") places get a red dot with a glow —
        // unvisited ones stay neutral grey/uncoloured, keeping the "fog of
        // war" reveal readable: red = been there, grey = not yet.
        const el = document.createElement("div");
        el.style.cssText = "transform:translate(-50%,-50%);will-change:transform;cursor:pointer;";
        el.innerHTML = p.visited
          ? `<span style="display:block;width:12px;height:12px;border-radius:9999px;background:#F65C6B;box-shadow:0 0 0 3px rgba(246,92,107,.25),0 0 10px 2px rgba(246,92,107,.45);"></span>`
          : `<span style="display:block;width:8px;height:8px;border-radius:9999px;background:#9CA3AF;opacity:.5;"></span>`;

        // Hover always shows just the name (desktop) — a light-weight label,
        // not the memory itself. On a visited spot, click opens the full
        // memory (photo/note) via the caller; elsewhere click falls back to
        // toggling the name popup, since tap has no hover equivalent.
        const popup = new maplibregl.Popup({ offset: 14, closeButton: false, closeOnClick: false }).setText(
          p.name,
        );
        el.addEventListener("mouseenter", () => popup.setLngLat([p.longitude, p.latitude]).addTo(map));
        el.addEventListener("mouseleave", () => popup.remove());
        el.addEventListener("click", (e) => {
          e.stopPropagation();
          if (p.visited && onSelectMemoryRef.current) {
            popup.remove();
            onSelectMemoryRef.current(p);
            return;
          }
          if (popup.isOpen()) popup.remove();
          else popup.setLngLat([p.longitude, p.latitude]).addTo(map);
        });

        const marker = new maplibregl.Marker({ element: el, anchor: "center" })
          .setLngLat([p.longitude, p.latitude])
          .addTo(map);
        markersRef.current.push(marker);
      });
    };

    if (map.isStyleLoaded()) draw();
    else map.once("load", draw);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sig]);

  return <div ref={containerRef} className={className ?? "h-full w-full"} />;
}
