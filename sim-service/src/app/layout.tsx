import type { ReactNode } from 'react';

export const metadata = {
  title: 'Selkie Sim Service',
  description: '模擬微服務',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="zh-Hant">
      <body>{children}</body>
    </html>
  );
}
