import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Produces a minimal standalone server for the Docker runtime image.
  output: "standalone",
  // Trace files from the monorepo root so standalone output is complete.
  outputFileTracingRoot: path.join(__dirname, ".."),
  // Consume the shared workspace's TypeScript directly.
  transpilePackages: ["@groweasy/shared"],
};

export default nextConfig;
