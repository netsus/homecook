import type { NextConfig } from "next";

const isQaFixtureServer = process.env.HOMECOOK_ENABLE_QA_FIXTURES === "1";

const nextConfig: NextConfig = {
  ...(isQaFixtureServer ? { devIndicators: false } : {}),
};

export default nextConfig;
