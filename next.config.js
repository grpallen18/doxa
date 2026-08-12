const path = require('path')

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  outputFileTracingRoot: path.join(__dirname),
  transpilePackages: ['three', '3d-force-graph', 'three-forcegraph'],
  async redirects() {
    return [
      {
        source: '/admin/pipeline',
        destination: '/admin',
        permanent: false,
      },
    ]
  },
  async headers() {
    // Dev only: stop browsers from holding stale HTML/API/chunk responses
    // across two open tabs while iterating on the Neo explorer.
    if (process.env.NODE_ENV !== 'development') return []
    return [
      {
        source: '/:path*',
        headers: [
          {
            key: 'Cache-Control',
            value: 'no-store, no-cache, must-revalidate, max-age=0',
          },
          { key: 'Pragma', value: 'no-cache' },
        ],
      },
    ]
  },
}

module.exports = nextConfig
