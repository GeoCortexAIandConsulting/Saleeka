/** @type {import('next').NextConfig} */
const API_URL = process.env.API_URL || 'http://localhost:4000';

export default {
  reactStrictMode: true,
  // The browser talks only to this site; Next forwards /api to the Express server.
  // That keeps the login cookie first-party (no CORS or third-party cookie problems).
  async rewrites() {
    return [{ source: '/api/:path*', destination: `${API_URL}/api/:path*` }];
  },
};
