import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Loaded at runtime on the server instead of bundled (optional deps inside).
  serverExternalPackages: ['read-excel-file', 'unzipper'],
};

export default nextConfig;
