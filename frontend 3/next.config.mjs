/** @type {import('next').NextConfig} */

// The FastAPI backend now only allows its own configured origins (see
// ALLOWED_ORIGINS in the backend's .env), so we proxy all /api/* calls
// through the Next server to the backend origin — the browser only ever
// talks to this same origin, and Next forwards server-to-server.
// Override the backend location with BACKEND_ORIGIN in .env.local if needed.
const BACKEND_ORIGIN = process.env.BACKEND_ORIGIN || "http://localhost:8000";

const nextConfig = {
  reactStrictMode: true,
  // maplibre-gl ships an ESM build that Next's webpack must transpile itself;
  // without this the RouteMap dynamic chunk can fail to emit (ChunkLoadError:
  // .../_next/undefined). Transpiling it keeps the client + server manifests in sync.
  transpilePackages: ["maplibre-gl"],
  // Webpack's persistent dev cache (.next/cache/webpack/*.pack.gz) has
  // repeatedly gotten corrupted in this environment — writes fail partway
  // (an ENOENT on the atomic rename) and the dev server then keeps serving
  // stale module graphs referencing files that no longer exist, long after
  // the source has moved on. Disabling the cache in dev trades a bit of
  // rebuild speed for never hitting that class of bug again.
  webpack: (config, { dev }) => {
    if (dev) config.cache = false;
    return config;
  },
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: `${BACKEND_ORIGIN}/:path*`,
      },
    ];
  },
  async headers() {
    return [
      {
        // every route — static assets included, same as any other response
        // this origin serves
        source: "/:path*",
        headers: [
          // Harmless to send over plain HTTP in dev — browsers only act on
          // it over HTTPS. Real enforcement happens once this is actually
          // deployed behind TLS.
          { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          // Only this app's own pages use geolocation (login's "enable live
          // location") and camera (Explorer's photo capture) — self is
          // enough, no embedder should get either.
          { key: "Permissions-Policy", value: "geolocation=(self), camera=(self), microphone=()" },
        ],
      },
    ];
  },
};

export default nextConfig;
