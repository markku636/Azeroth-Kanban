import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

// 單元測試設定。只跑純邏輯（不連 DB/網路）的 *.test.ts；用 @ 別名對齊 tsconfig。
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
});
