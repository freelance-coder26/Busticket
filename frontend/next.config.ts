import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  output: "export",
  experimental: {
    agentFeedback: true,
  },
  cacheComponents: false,
  partialPrefetching: false,
  turbopack: {
    root: path.resolve(process.cwd(), ".."),
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
