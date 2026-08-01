/** @type {import('next').NextConfig} */
const nextConfig = {
  // OG 이미지 생성 시 쓰는 한글 폰트를 서버리스 함수 번들에 포함
  outputFileTracingIncludes: {
    "/member/[monaCd]/opengraph-image": ["./assets/Pretendard-Bold.ttf"],
  },
};

export default nextConfig;
