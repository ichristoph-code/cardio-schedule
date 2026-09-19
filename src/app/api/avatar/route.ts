import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// PUT    /api/avatar — set the signed-in user's own profile photo.
// DELETE /api/avatar — remove it.
//
// The body is the photo itself: a JPEG the browser has already cropped and
// shrunk to 256x256 (see ProfilePhotoDialog), so it is ~20 KB. The size cap and
// the JPEG check are there because a request need not come from that dialog.

const MAX_BYTES = 200 * 1024;

export async function PUT(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const data = new Uint8Array(await req.arrayBuffer());
  if (data.length === 0 || data.length > MAX_BYTES) {
    return NextResponse.json({ error: "Photo must be under 200 KB" }, { status: 413 });
  }
  // Every JPEG starts FF D8 FF.
  if (data[0] !== 0xff || data[1] !== 0xd8 || data[2] !== 0xff) {
    return NextResponse.json({ error: "Photo must be a JPEG" }, { status: 415 });
  }

  await prisma.userAvatar.upsert({
    where: { userId: session.user.id },
    create: { userId: session.user.id, data },
    update: { data },
  });
  return NextResponse.json({ ok: true });
}

export async function DELETE() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  await prisma.userAvatar.deleteMany({ where: { userId: session.user.id } });
  return NextResponse.json({ ok: true });
}
