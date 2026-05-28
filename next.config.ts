import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'image.tmdb.org' },
      // 국립중앙도서관 표지 호스트 — 실제 응답 호스트가 확정되지 않은 상태로
      // 후보 도메인을 미리 잡음. 미스매치 시 next/image가 console 에러를 내고
      // 표지는 안 보임 (URL 자체는 DB에 저장됨 — 호스트 확인 후 추가).
      { protocol: 'https', hostname: 'image.nl.go.kr' },
      { protocol: 'http', hostname: 'image.nl.go.kr' },
    ],
  },
}

export default nextConfig
