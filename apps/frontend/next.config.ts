import type { NextConfig } from "next";

const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://localhost:13001";

const nextConfig: NextConfig = {
  output: "standalone",
  async rewrites() {
    return [
      {
        source: "/api/projects/:path*",
        destination: `${backendUrl}/api/projects/:path*`,
      },
      {
        source: "/api/notes/:path*",
        destination: `${backendUrl}/api/notes/:path*`,
      },
      {
        source: "/api/files/:path*",
        destination: `${backendUrl}/api/files/:path*`,
      },
    ];
  },
};

export default nextConfig;
