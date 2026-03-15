import "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      email: string;
      name: string;
      role: "ADMIN" | "PHYSICIAN";
      physicianId: string | null;
    };
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    role: "ADMIN" | "PHYSICIAN";
    physicianId: string | null;
  }
}
