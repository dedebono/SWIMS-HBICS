import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // @ts-expect-error - Next.js 15+ added this but types might not be updated
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
