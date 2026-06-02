import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: ['swims.ytcb.org', 'https://swims.ytcb.org'],
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: `${process.env.BACKEND_INTERNAL_URL || 'http://127.0.0.1:4000'}/api/:path*`, // Proxy to Backend
      },
    ];
  },
};

export default nextConfig;
