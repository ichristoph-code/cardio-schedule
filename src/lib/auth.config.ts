import type { NextAuthConfig } from "next-auth";

// This config is used by middleware (Edge Runtime).
// It must NOT import prisma, pg, or any Node.js-only modules.
export const authConfig = {
  pages: {
    signIn: "/login",
  },
  session: {
    strategy: "jwt" as const,
  },
  callbacks: {
    session({ session, token }) {
      if (session.user) {
        const u = session.user as unknown as Record<string, unknown>;
        u.role = token.role;
        u.physicianId = token.physicianId;
        session.user.id = token.sub!;
      }
      return session;
    },
    authorized({ auth, request: { nextUrl } }) {
      const isLoggedIn = !!auth?.user;
      const isOnDashboard = nextUrl.pathname.startsWith("/dashboard");

      if (isOnDashboard) {
        if (isLoggedIn) return true;
        return false; // Redirect to login
      }

      // Allow sign-in even when an old edge token exists: server-side checks
      // may have revoked it after a password or permission change.
      return true;
    },
  },
  providers: [], // Providers are added in the full auth.ts
} satisfies NextAuthConfig;
