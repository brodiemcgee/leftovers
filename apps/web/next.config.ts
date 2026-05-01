import type { NextConfig } from 'next';

const config: NextConfig = {
  experimental: {
    serverActions: { allowedOrigins: ['leftovers.app', 'localhost:3000'] },
  },
  reactStrictMode: true,
  poweredByHeader: false,
  transpilePackages: ['@leftovers/api', '@leftovers/shared', '@leftovers/sync', '@leftovers/categoriser'],
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'X-Frame-Options', value: 'DENY' },
          {
            key: 'Strict-Transport-Security',
            value: 'max-age=63072000; includeSubDomains; preload',
          },
        ],
      },
    ];
  },
};

export default config;
