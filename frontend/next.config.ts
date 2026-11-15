import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Next.js configuration
  devIndicators: false,
  distDir: process.env.NODE_ENV === "development" ? ".next-dev" : ".next",
  experimental: {
    agentUpgrade: "security",
  },
};

export default nextConfig;
