import dotenv from 'dotenv';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

dotenv.config({ path: '../.env' });
dotenv.config({ path: '.env.local', override: true });

process.env.NEXT_PUBLIC_SUPABASE_URL ||= process.env.SUPABASE_URL;

const dashboardRoot = dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  outputFileTracingRoot: dashboardRoot
};

export default nextConfig;
