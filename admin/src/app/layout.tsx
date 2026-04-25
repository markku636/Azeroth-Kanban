import type { Metadata } from "next";
import { SessionProvider } from "next-auth/react";
import { inter, lexendDeca } from "@/app/fonts";
import cn from "@/utils/class-names";
import NextProgress from "@/components/next-progress";
import { ThemeProvider, JotaiProvider } from "@/app/shared/theme-provider";

import "./globals.css";

export const metadata: Metadata = {
  title: "Azeroth Kanban",
  description: "Azeroth Kanban 看板系統",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      // 💡 Prevent next-themes hydration warning
      suppressHydrationWarning
    >
      <body
        // to prevent any warning that is caused by third party extensions like Grammarly
        suppressHydrationWarning
        className={cn(inter.variable, lexendDeca.variable, "font-inter")}
      >
        <SessionProvider>
          <ThemeProvider>
            <NextProgress />
            <JotaiProvider>{children}</JotaiProvider>
          </ThemeProvider>
        </SessionProvider>
      </body>
    </html>
  );
}
