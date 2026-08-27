"use client";

import { useEffect, useRef } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { MAP_STYLE } from "@/lib/constants";
import { curveBetween, pointAlong, boundsOf, type LngLat } from "@/lib/geo";

export interface RouteSegment {
  from: LngLat;
  to: LngLat;
  color: string; // mode colour (hex)
}
export interface RouteWaypoint {
  lngLat: LngLat;
  label: string;
  kind: "origin" | "stop" | "dest";
  order?: number;
}

// Flowing-dash line animation frames (MapLibre "ant march" technique).
const DASH_SEQUENCE: number[][] = [
  [0, 4, 3],
  [0.5, 4, 2.5],
  [1, 4, 2],
  [1.5, 4, 1.5],
  [2, 4, 1],
  [2.5, 4, 0.5],
  [3, 4, 0],
  [0, 0.5, 3, 3.5],
  [0, 1, 3, 3],
  [0, 1.5, 3, 2.5],
  [0, 2, 3, 2],
  [0, 2.5, 3, 1.5],
  [0, 3, 3, 1],
  [0, 3.5, 3, 0.5],
];

export default function RouteMap({
  segments,
  waypoints,
  className,
}: {
  segments: RouteSegment[];
  waypoints: RouteWaypoint[];
  className?: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markersRef = useRef<maplibregl.Marker[]>([]);
  const rafRef = useRef<number>(0);
  const dashTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // stable signature so we redraw only when the actual route changes
  const sig = JSON.stringify({ segments, waypoints: waypoints.map((w) => [w.lngLat, w.kind, w.order]) });

  // create map once
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: MAP_STYLE,
      center: waypoints[0]?.lngLat ?? [80.2707, 13.0827],
      zoom: 11,
      attributionControl: false,
    });
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
    map.addControl(new maplibregl.AttributionControl({ compact: true }));
    mapRef.current = map;
    return () => {
      cancelAnimationFrame(rafRef.current);
      if (dashTimerRef.current) clearInterval(dashTimerRef.current);
      markersRef.current.forEach((m) => m.remove());
      markersRef.current = [];
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // (re)draw route whenever the signature changes
  useEffect(() => {
    const map = mapRef.current;
    if (!map || segments.length === 0) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const draw = () => {
      // clear previous layers/sources/markers
      cancelAnimationFrame(rafRef.current);
      if (dashTimerRef.current) clearInterval(dashTimerRef.current);
      markersRef.current.forEach((m) => m.remove());
      markersRef.current = [];
      segments.forEach((_, i) => {
        for (const id of [`glow-${i}`, `dash-${i}`]) if (map.getLayer(id)) map.removeLayer(id);
        if (map.getSource(`route-${i}`)) map.removeSource(`route-${i}`);
      });

      // build curved geometry per segment + a concatenated path for the marker
      const fullPath: LngLat[] = [];
      segments.forEach((seg, i) => {
        const curve = curveBetween(seg.from, seg.to, 48, 0.16);
        if (i === 0) fullPath.push(...curve);
        else fullPath.push(...curve.slice(1));

        map.addSource(`route-${i}`, {
          type: "geojson",
          data: { type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: curve } },
        });
        // soft glow casing
        map.addLayer({
          id: `glow-${i}`,
          type: "line",
          source: `route-${i}`,
          layout: { "line-cap": "round", "line-join": "round" },
          paint: {
            "line-color": seg.color,
            "line-width": 9,
            "line-opacity": 0.22,
            "line-blur": 6,
          },
        });
        // animated dashed line on top
        map.addLayer({
          id: `dash-${i}`,
          type: "line",
          source: `route-${i}`,
          layout: { "line-cap": "round", "line-join": "round" },
          paint: {
            "line-color": seg.color,
            "line-width": 3.5,
            "line-dasharray": [0, 4, 3],
          },
        });
      });

      // waypoint markers
      for (const wp of waypoints) {
        const el = document.createElement("div");
        el.style.cssText = "transform:translate(-50%,-50%);will-change:transform;";
        el.innerHTML = markerHTML(wp);
        const marker = new maplibregl.Marker({ element: el, anchor: "center" })
          .setLngLat(wp.lngLat)
          .setPopup(new maplibregl.Popup({ offset: 18, closeButton: false }).setText(wp.label))
          .addTo(map);
        markersRef.current.push(marker);
      }

      // moving "vehicle" marker
      const moverEl = document.createElement("div");
      moverEl.innerHTML = `<span style="display:block;width:14px;height:14px;border-radius:9999px;background:#2DD4BF;box-shadow:0 0 0 4px rgba(45,212,191,.25),0 0 16px 4px rgba(45,212,191,.6);"></span>`;
      moverEl.style.cssText = "transform:translate(-50%,-50%);";
      const mover = new maplibregl.Marker({ element: moverEl, anchor: "center" })
        .setLngLat(fullPath[0])
        .addTo(map);
      markersRef.current.push(mover);

      // fit to route
      const b = boundsOf(fullPath);
      map.fitBounds(b, { padding: 70, duration: 800, maxZoom: 15 });

      if (reduce) {
        segments.forEach((_, i) => map.setPaintProperty(`dash-${i}`, "line-dasharray", [2, 2]));
        return;
      }

      // flowing dash animation
      let step = 0;
      dashTimerRef.current = setInterval(() => {
        step = (step + 1) % DASH_SEQUENCE.length;
        segments.forEach((_, i) => {
          if (map.getLayer(`dash-${i}`)) map.setPaintProperty(`dash-${i}`, "line-dasharray", DASH_SEQUENCE[step]);
        });
      }, 55);

      // moving marker along the whole path (eased loop)
      const LOOP_MS = Math.min(9000, 2200 + fullPath.length * 45);
      let start = 0;
      const tick = (now: number) => {
        if (!start) start = now;
        const raw = ((now - start) % LOOP_MS) / LOOP_MS;
        const eased = raw < 0.5 ? 2 * raw * raw : 1 - Math.pow(-2 * raw + 2, 2) / 2; // easeInOut
        mover.setLngLat(pointAlong(fullPath, eased));
        rafRef.current = requestAnimationFrame(tick);
      };
      rafRef.current = requestAnimationFrame(tick);
    };

    if (map.isStyleLoaded()) draw();
    else map.once("load", draw);

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sig]);

  return <div ref={containerRef} className={className ?? "h-full w-full"} />;
}

function markerHTML(wp: RouteWaypoint): string {
  if (wp.kind === "origin") {
    return `<span style="display:grid;place-items:center;width:26px;height:26px;border-radius:9999px;background:#2DD4BF;color:#06121A;font-weight:700;font-size:11px;box-shadow:0 0 0 4px rgba(45,212,191,.25);">A</span>`;
  }
  if (wp.kind === "dest") {
    return `<span style="display:grid;place-items:center;width:26px;height:26px;border-radius:9999px;background:#FF7A6B;color:#1a0a08;font-weight:700;font-size:11px;box-shadow:0 0 0 4px rgba(255,122,107,.25);">B</span>`;
  }
  return `<span style="display:grid;place-items:center;width:24px;height:24px;border-radius:9999px;background:#2DD4BF;color:#04211d;font-weight:700;font-size:11px;box-shadow:0 0 0 4px rgba(45,212,191,.22);">${wp.order ?? "•"}</span>`;
}
