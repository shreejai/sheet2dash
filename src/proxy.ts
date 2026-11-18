import { NextResponse } from "next/server";
import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { LAST_SHEET_COOKIE } from "@/lib/last-sheet";

const isProtectedRoute = createRouteMatcher(["/dashboard(.*)", "/api(.*)"]);
const SHEET_PATH = /^\/dashboard\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})(?:\/|$)/i;

export default clerkMiddleware(async (auth, req) => {
  if (isProtectedRoute(req)) await auth.protect();

  // Remember the sheet being opened, so /dashboard returns to it next time.
  // The page itself still checks the user may see it.
  const sheetId = SHEET_PATH.exec(req.nextUrl.pathname)?.[1];
  if (sheetId && req.cookies.get(LAST_SHEET_COOKIE)?.value !== sheetId) {
    const res = NextResponse.next();
    res.cookies.set(LAST_SHEET_COOKIE, sheetId, {
      path: "/",
      httpOnly: true,
      sameSite: "lax",
      secure: req.nextUrl.protocol === "https:",
      maxAge: 60 * 60 * 24 * 365,
    });
    return res;
  }
});

export const config = {
  matcher: [
    // Skip Next.js internals and static files
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
