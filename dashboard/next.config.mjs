import dotenv from 'dotenv';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

dotenv.config({ path: '../.env' });
dotenv.config({ path: '.env.local', override: true });

process.env.NEXT_PUBLIC_SUPABASE_URL ||= process.env.SUPABASE_URL;

const dashboardRoot = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(dashboardRoot, '..');
const dashboardNodeModules = resolve(dashboardRoot, 'node_modules');

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  ...(process.env.STAYNEX_NEXT_DIST_DIR ? { distDir: process.env.STAYNEX_NEXT_DIST_DIR } : {}),
  outputFileTracingRoot: repoRoot,
  webpack(config) {
    config.resolve ||= {};
    config.resolve.modules = [
      dashboardNodeModules,
      ...(config.resolve.modules || [])
    ];

    return config;
  },
  async headers() {
    return [
      {
        source: '/api/:path*',
        headers: [
          {
            key: 'Cache-Control',
            value: 'no-store, no-cache, max-age=0, must-revalidate'
          }
        ]
      }
    ];
  }
};

export default nextConfig;
