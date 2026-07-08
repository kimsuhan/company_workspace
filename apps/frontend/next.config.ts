import type { NextConfig } from "next";

const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://localhost:13001";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["127.0.0.1"],
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
      {
        source: "/api/slack/:path*",
        destination: `${backendUrl}/slack/:path*`,
      },
      {
        source: "/api/workspace-users/:path*",
        destination: `${backendUrl}/api/workspace-users/:path*`,
      },
    ];
  },
};

export default nextConfig;
