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
}

// "Fog of war" city map — unvisited places sit as dim grey dots, visited ones
// light up with a glowing marker + soft reveal halo. Reuses the exact
// MapLibre mount/cleanup/style pattern from components/routes/RouteMap.tsx.
export default function PassportMap({ places, className }: { places: PassportPlace[]; className?: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markersRef = useRef<maplibregl.Marker[]>([]);

  const sig = JSON.stringify(places.map((p) => [p.id, p.visited]));

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
              "circle-radius": 26,
              "circle-color": "#2DD4BF",
              "circle-opacity": 0.16,
              "circle-blur": 1,
            },
          });
        }

        const el = document.createElement("div");
        el.style.cssText = "transform:translate(-50%,-50%);will-change:transform;";
        el.innerHTML = p.visited
          ? `<span style="display:block;width:22px;height:22px;border-radius:9999px;background:#2DD4BF;box-shadow:0 0 0 5px rgba(45,212,191,.28),0 0 18px 4px rgba(45,212,191,.55);"></span>`
          : `<span style="display:block;width:12px;height:12px;border-radius:9999px;background:#334155;opacity:.6;"></span>`;
        const marker = new maplibregl.Marker({ element: el, anchor: "center" })
          .setLngLat([p.longitude, p.latitude])
          .setPopup(new maplibregl.Popup({ offset: 16, closeButton: false }).setText(p.name))
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
