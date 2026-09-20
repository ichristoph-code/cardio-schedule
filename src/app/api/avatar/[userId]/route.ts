import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// GET /api/avatar/<userId> — that user's profile photo, for any signed-in user.
// 404 when they have none; the <AvatarImage> that asked falls back to initials.
export async function GET(req: Request, { params }: { params: Promise<{ userId: string }> }) {
  const session = await auth();
  if (!session?.user) return new NextResponse("Unauthorized", { status: 401 });

  const { userId } = await params;
  const avatar = await prisma.userAvatar.findUnique({ where: { userId } });
  if (!avatar) return new NextResponse("Not found", { status: 404 });

  // The URL never changes when the photo does, so the browser must ask each
  // time (no-cache) — but the ETag turns that into an empty 304 unless the
  // photo really changed.
  const etag = `"${avatar.updatedAt.getTime()}"`;
  const headers = { ETag: etag, "Cache-Control": "private, no-cache" };
  if (req.headers.get("if-none-match") === etag) {
    return new NextResponse(null, { status: 304, headers });
  }
  return new NextResponse(new Uint8Array(avatar.data), {
    headers: { ...headers, "Content-Type": "image/jpeg" },
  });
}
