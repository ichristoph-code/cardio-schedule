import NextAuth from "next-auth";
import { authConfig } from "@/lib/auth.config";

// Use the edge-safe auth config (no Prisma/pg imports).
// The `authorized` callback in auth.config.ts handles auth checks.
export default NextAuth(authConfig).auth;

export const config = {
  matcher: ["/dashboard/:path*", "/login"],
};
