import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // An epub is uploaded whole to `extractEpub`; the 1 MB default rejects books.
    serverActions: { bodySizeLimit: "32mb" },
  },
};

export default nextConfig;
