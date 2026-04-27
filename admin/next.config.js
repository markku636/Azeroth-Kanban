const path = require("path");
const withBundleAnalyzer = require("@next/bundle-analyzer")({
  enabled: process.env.ANALYZE === "true",
});

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  // Monorepo: 追蹤從 repo root 開始，確保 standalone 包含正確的 node_modules
  outputFileTracingRoot: path.join(__dirname, "../"),
  async redirects() {
    return [
      // 舊的 /admin/* 路徑已移除（commit 3578db3），統一導回首頁，
      // 由 middleware 依登入狀態再分流到 /login 或 /kanban
      { source: "/admin", destination: "/", permanent: true },
      { source: "/admin/:path*", destination: "/", permanent: true },
    ];
  },
};

module.exports = withBundleAnalyzer(nextConfig);
