import { auth } from "@/auth";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const PUBLIC_PATHS = new Set<string>(["/login"]);
const POST_LOGIN_PATH = "/kanban";

export default auth(async (req: NextRequest & { auth: { user?: unknown } | null }) => {
  const { pathname } = req.nextUrl;
  const isAuthenticated = !!req.auth?.user;

  // ── 公開路由（白名單）──
  if (PUBLIC_PATHS.has(pathname)) {
    if (isAuthenticated) {
      return NextResponse.redirect(new URL(POST_LOGIN_PATH, req.url));
    }
    return NextResponse.next();
  }

  // ── 其他路徑：未登入導向 /login 並帶上 callbackUrl ──
  if (!isAuthenticated) {
    const loginUrl = new URL("/login", req.url);
    loginUrl.searchParams.set("callbackUrl", pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
});

export const config = {
  matcher: [
    "/((?!api/auth|api/v1|_next|favicon\\.ico|images|.*\\.(?:png|jpg|jpeg|gif|svg|ico|webp)).*)",
  ],
};
