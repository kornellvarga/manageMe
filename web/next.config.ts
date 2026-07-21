import type { NextConfig } from "next";

const repository = process.env.GITHUB_REPOSITORY?.split("/")[1] || "";
const inferredBasePath = process.env.GITHUB_ACTIONS === "true" && repository ? `/${repository}` : "";
const basePath = process.env.MANAGEME_BASE_PATH ?? inferredBasePath;

const nextConfig: NextConfig = {
  output: "export",
  trailingSlash: true,
  basePath,
  assetPrefix: basePath || undefined,
  images: {
    unoptimized: true,
  },
};

export default nextConfig;

