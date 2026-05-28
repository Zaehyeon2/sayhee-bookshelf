import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'image.tmdb.org' },
      { protocol: 'https', hostname: 'shopping-phinf.pstatic.net' },
      // RFC 6761 reserved TLD — never resolves on the public internet, used
      // by e2e fixtures so SSR validation passes without hitting a real CDN.
      { protocol: 'https', hostname: 'images.example.test' },
    ],
  },
}

export default nextConfig
