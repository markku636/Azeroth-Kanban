import { auth } from "@/auth";
import { NextResponse, type NextRequest } from "next/server";

const PUBLIC_PATHS = new Set<string>(["/login"]);
// 免 SSO 路由：對外 status page。頁面外殼本身「不含任何資料」，
// 真正的資料 API (/api/v1/public/status) 另以 ?key= 共享金鑰把關，
// 所以這裡放行的只是一個空殼頁、不算資訊外洩。
const OPEN_PATHS = new Set<string>(["/status"]);
const POST_LOGIN_PATH = "/incidents";

export default auth((req: NextRequest & { auth: { user?: unknown } | null }) => {
  const { pathname } = req.nextUrl;
  const isAuthenticated = !!req.auth?.user;

  // ── 免 SSO 路由：放行頁面外殼，資料層另以金鑰把關 ──
  if (OPEN_PATHS.has(pathname)) {
    return NextResponse.next();
  }

  // ── 公開路由（白名單，如 /login）：已登入則踢回主頁 ──
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
