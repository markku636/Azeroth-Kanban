const path = require('path');
const withBundleAnalyzer = require('@next/bundle-analyzer')({
  enabled: process.env.ANALYZE === 'true',
});

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  // Monorepo: 追蹤從 repo root 開始，確保 standalone 包含正確的 node_modules
  outputFileTracingRoot: path.join(__dirname, '../'),
  // Selkie agent 與 LangChain 為 Node-only 套件，標記為 server external：
  // 不打包進 bundle、不進 client，執行時直接從 node_modules 載入。
  serverExternalPackages: [
    '@azeroth/selkie',
    'deepagents',
    'langchain',
    '@langchain/core',
    '@langchain/langgraph',
    '@langchain/google-vertexai',
    '@langchain/mcp-adapters',
  ],
  async redirects() {
    return [
      // 舊的 /admin/* 路徑已移除（commit 3578db3），統一導回首頁，
      // 由 middleware 依登入狀態再分流到 /login 或 /kanban
      { source: '/admin', destination: '/', permanent: true },
      { source: '/admin/:path*', destination: '/', permanent: true },
    ];
  },
};

module.exports = withBundleAnalyzer(nextConfig);
