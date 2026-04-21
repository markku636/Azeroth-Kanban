const path = require("path");
const withBundleAnalyzer = require("@next/bundle-analyzer")({
  enabled: process.env.ANALYZE === "true",
});

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  // Monorepo: 追蹤從 repo root 開始，確保 standalone 包含正確的 node_modules
  outputFileTracingRoot: path.join(__dirname, "../"),
};

module.exports = withBundleAnalyzer(nextConfig);
