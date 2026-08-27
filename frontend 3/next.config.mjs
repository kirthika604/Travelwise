/** @type {import('next').NextConfig} */

// The FastAPI backend has no CORS middleware, so we proxy all /api/* calls
// through the Next server to the backend origin. The browser only ever talks
// to the same origin (Next), sidestepping CORS entirely.
// Override the backend location with BACKEND_ORIGIN in .env.local if needed.
const BACKEND_ORIGIN = process.env.BACKEND_ORIGIN || "http://localhost:8000";

const nextConfig = {
  reactStrictMode: true,
  // maplibre-gl ships an ESM build that Next's webpack must transpile itself;
  // without this the RouteMap dynamic chunk can fail to emit (ChunkLoadError:
  // .../_next/undefined). Transpiling it keeps the client + server manifests in sync.
  transpilePackages: ["maplibre-gl"],
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: `${BACKEND_ORIGIN}/:path*`,
      },
    ];
  },
};

export default nextConfig;
