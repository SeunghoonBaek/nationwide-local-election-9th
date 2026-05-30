import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "cdn.nec.go.kr",
        pathname: "/photo_**",
      },
    ],
  },
};

export default nextConfig;
