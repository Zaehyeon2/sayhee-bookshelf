import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // Next 16 Cache Components — 'use cache: remote' directive 활성화 위해 필수.
  // 기본 dynamic page는 그대로 dynamic, 명시적 'use cache' 함수만 cache.
  cacheComponents: true,
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
