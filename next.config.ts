import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /** Allow phones/tablets on the LAN to load dev HMR assets (e.g. http://192.168.x.x:3000). */
  allowedDevOrigins: ["192.168.10.118", "192.168.*.*"],
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "cdn.nec.go.kr",
        pathname: "/photo_*/**",
      },
    ],
  },
};

export default nextConfig;
