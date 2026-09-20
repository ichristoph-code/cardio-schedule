import { createHash } from "node:crypto";
import type { JWT } from "next-auth/jwt";

interface CurrentUser {
  id: string; email: string; passwordHash: string; role: "ADMIN" | "PHYSICIAN" | "VIEWER";
  physician: { id: string; firstName: string; lastName: string } | null;
}
/** Encrypted session tokens hold a digest, never the password or its bcrypt hash. */
export function refreshSessionToken(token: Partial<JWT>, user: CurrentUser | null, signingIn: boolean): JWT | null {
  if (!user) return null;
  const version = createHash("sha256").update(JSON.stringify([user.passwordHash, user.role, user.physician?.id ?? null])).digest("hex");
  // Legacy sessions also sign in again rather than inheriting unverified privileges.
  if (!signingIn && token.authVersion !== version) return null;
  return { ...token, sub: user.id, email: user.email, role: user.role, physicianId: user.physician?.id ?? null,
    name: user.physician ? `${user.physician.firstName} ${user.physician.lastName}` : user.role === "ADMIN" ? "Admin" : "Viewer", authVersion: version };
}
