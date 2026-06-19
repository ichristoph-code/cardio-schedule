import NextAuth from "next-auth";
import { NextResponse } from "next/server";
import { authConfig } from "@/lib/auth.config";

// Use the edge-safe auth config (no Prisma/pg imports).
// The `authorized` callback in auth.config.ts gates access; the wrapper below
// runs only for already-authorized requests and adds one redirect.
const { auth } = NextAuth(authConfig);

export default auth((req) => {
  // Default the Vacation Calendar to the last-viewed physician. A redirect here
  // (rather than reading the cookie in the page) survives Next's client-side
  // router cache / prefetch, which can otherwise serve a stale alphabetical
  // render of the param-less route. Only acts for logged-in users.
  const { nextUrl } = req;
  if (
    req.auth?.user &&
    nextUrl.pathname === "/dashboard/vacation" &&
    !nextUrl.searchParams.has("physician")
  ) {
    const last = req.cookies.get("vac_last_physician")?.value;
    if (last) {
      const dest = nextUrl.clone();
      dest.searchParams.set("physician", last);
      return NextResponse.redirect(dest);
    }
  }
  // Otherwise fall through — the authorized callback has already decided access.
});

export const config = {
  matcher: ["/dashboard/:path*", "/login"],
};
