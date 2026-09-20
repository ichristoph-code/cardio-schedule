import { describe, it, expect } from "vitest";
import { refreshSessionToken } from "./auth-session";
const user = { id: "user", email: "test@example.test", passwordHash: "one", role: "ADMIN" as const, physician: null };
describe("current account session validation", () => {
  it("allows unchanged accounts without exposing the password hash", () => {
    const token = refreshSessionToken({}, user, true)!;
    expect(refreshSessionToken(token, user, false)?.role).toBe("ADMIN");
    expect(token.authVersion).not.toBe(user.passwordHash);
    expect(token).not.toHaveProperty("passwordHash");
  });
  it("revokes existing sessions after demotion, password reset, physician relinking, or deletion", () => {
    const token = refreshSessionToken({}, user, true)!;
    expect(refreshSessionToken(token, { ...user, role: "VIEWER" }, false)).toBeNull();
    expect(refreshSessionToken(token, { ...user, passwordHash: "two" }, false)).toBeNull();
    expect(refreshSessionToken(token, { ...user, physician: { id: "new", firstName: "Test", lastName: "Doctor" } }, false)).toBeNull();
    expect(refreshSessionToken(token, null, false)).toBeNull();
    expect(refreshSessionToken({ sub: user.id }, user, false)).toBeNull();
  });
  it("uses fresh permissions when signing in again", () => {
    expect(refreshSessionToken({}, { ...user, role: "VIEWER" }, true)?.role).toBe("VIEWER");
  });
});
