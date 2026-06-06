const path = require('path')

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  outputFileTracingRoot: path.join(__dirname),
  async redirects() {
    return [
      {
        source: '/admin/pipeline',
        destination: '/admin',
        permanent: false,
      },
    ]
  },
}

module.exports = nextConfig
