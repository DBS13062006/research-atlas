import { type NextRequest, NextResponse } from "next/server";

// Optimistic redirects only: an anonymous visitor (no session cookie) is sent to /login from pages
// that need an account. Whether the caller may actually see or change anything is decided by the
// data layer and, finally, by PostgreSQL — never by this file.
const SESSION_COOKIE = "ra_session";
const PROTECTED = ["/library", "/curate", "/admin", "/lab", "/account"];

export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const needsAccount = PROTECTED.some((p) => pathname === p || pathname.startsWith(`${p}/`));
  if (needsAccount && !request.cookies.has(SESSION_COOKIE)) {
    const url = new URL("/login", request.url);
    url.searchParams.set("next", `${pathname}${search}`);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/library/:path*", "/curate/:path*", "/admin/:path*", "/lab/:path*", "/account/:path*"],
};
