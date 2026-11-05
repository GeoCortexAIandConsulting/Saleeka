import { existsSync } from 'node:fs';

/** @type {import('next').NextConfig} */
const API_URL = process.env.API_URL || 'http://localhost:4000';

export default {
  reactStrictMode: true,
  // Checked here so the page never requests a model that is not there, which would log a 404 in the console.
  env: { NEXT_PUBLIC_HAS_MANNEQUIN: existsSync('public/models/mannequin.glb') ? '1' : '0' },
  // The AI stylist can take over a minute on a local model; the default proxy limit is 30 seconds.
  experimental: { proxyTimeout: 180000 },
  // The browser talks only to this site; Next forwards /api to the Express server.
  // That keeps the login cookie first-party (no CORS or third-party cookie problems).
  async rewrites() {
    return [{ source: '/api/:path*', destination: `${API_URL}/api/:path*` }];
  },
};
