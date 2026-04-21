import { auth } from "@/auth";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export default auth(async (req: NextRequest & { auth: { user?: unknown } | null }) => {
  const { pathname } = req.nextUrl;
  const isAuthenticated = !!req.auth?.user;

  // ── 登入頁 ──
  if (pathname === "/admin/login") {
    if (isAuthenticated) {
      return NextResponse.redirect(new URL("/admin", req.url));
    }
    return NextResponse.next();
  }

  // ── /admin/* 路由保護 ──
  if (pathname.startsWith("/admin")) {
    if (!isAuthenticated) {
      const loginUrl = new URL("/admin/login", req.url);
      loginUrl.searchParams.set("callbackUrl", pathname);
      return NextResponse.redirect(loginUrl);
    }
    return NextResponse.next();
  }

  // ── 根路徑 / ──
  if (pathname === "/") {
    if (!isAuthenticated) {
      return NextResponse.redirect(new URL("/admin/login", req.url));
    }
    return NextResponse.redirect(new URL("/admin", req.url));
  }

  return NextResponse.next();
});

export const config = {
  matcher: [
    "/((?!api/auth|api/v1|_next|favicon\\.ico|images|.*\\.(?:png|jpg|jpeg|gif|svg|ico|webp)).*)",
  ],
};
