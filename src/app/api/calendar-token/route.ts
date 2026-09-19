import { NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// The physician's calendar-subscription token. POST creates or rotates it —
// the old URL stops working the moment a new one exists, which is the whole
// point of rotating. DELETE turns the feed off.
//
// Physician-only: an admin has no personal calendar to subscribe to, and one
// physician must never be able to mint a link to another's.

async function physicianIdFromSession(): Promise<string | null> {
  const session = await auth();
  if (!session?.user) return null;
  return ((session.user as Record<string, unknown>).physicianId as string | null) ?? null;
}

export async function POST() {
  const physicianId = await physicianIdFromSession();
  if (!physicianId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // 24 random bytes → 32 URL-safe characters, 192 bits: not guessable.
  const token = randomBytes(24).toString("base64url");
  await prisma.physician.update({ where: { id: physicianId }, data: { calendarToken: token } });
  return NextResponse.json({ token });
}

export async function DELETE() {
  const physicianId = await physicianIdFromSession();
  if (!physicianId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  await prisma.physician.update({ where: { id: physicianId }, data: { calendarToken: null } });
  return NextResponse.json({ ok: true });
}
