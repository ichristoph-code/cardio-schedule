import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const EXTRACTION_PROMPT = `You are a JSON API. Return ONLY a raw JSON object — no explanation, no prose, no markdown, no code fences.

Analyze this yearly calendar image. The ONLY colors that represent vacation are:
- DARK RED / RED background = full vacation day
- LIGHT PINK / PALE PINK background = half day (morning off)

Do NOT count these as vacation under any circumstances:
- BLUE or light blue background → NOT vacation
- BLACK background or black text → NOT vacation
- YELLOW background → NOT vacation
- GREEN, GRAY, PURPLE, or any other color → NOT vacation
- Uncolored / white cells → NOT vacation

Only red and pink cell backgrounds indicate vacation days. Everything else must be ignored.

Return exactly this structure:
{"year":2026,"ranges":[{"startDate":"YYYY-MM-DD","endDate":"YYYY-MM-DD","halfDay":"NONE"}]}

halfDay values:
- "NONE" for red/dark-red full vacation days
- "MORNING" for pink/light-pink half days

Rules:
- Only include red or pink highlighted dates. Ignore everything else.
- Merge consecutive same-type (same halfDay value) red days into one range.
- Do NOT merge a red day with a pink day into the same range.
- Single day: startDate equals endDate.
- Dates in ISO 8601 format (YYYY-MM-DD).
- Infer the year from the image.
- Output MUST start with { and end with } — nothing else.`;

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if ((session.user as Record<string, unknown>).role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: "ANTHROPIC_API_KEY not configured" }, { status: 500 });
  }

  const formData = await req.formData();
  const file = formData.get("image") as File | null;

  if (!file) {
    return NextResponse.json({ error: "No image file provided" }, { status: 400 });
  }

  const allowedTypes = ["image/jpeg", "image/jpg", "image/png", "image/gif", "image/webp"];
  if (!allowedTypes.includes(file.type)) {
    return NextResponse.json(
      { error: `Unsupported image type: ${file.type}. Use JPEG, PNG, GIF, or WebP.` },
      { status: 400 }
    );
  }

  // Cap upload size before buffering into memory to avoid exhausting the
  // serverless function's memory with a large upload.
  const MAX_IMAGE_BYTES = 10 * 1024 * 1024; // 10 MB
  if (file.size > MAX_IMAGE_BYTES) {
    return NextResponse.json({ error: "Image too large (max 10 MB)" }, { status: 413 });
  }

  const bytes = await file.arrayBuffer();
  const base64 = Buffer.from(bytes).toString("base64");
  const mediaType = file.type as "image/jpeg" | "image/png" | "image/gif" | "image/webp";

  const message = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 4096,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "image",
            source: { type: "base64", media_type: mediaType, data: base64 },
          },
          { type: "text", text: EXTRACTION_PROMPT },
        ],
      },
    ],
  });

  const raw = message.content.find((b) => b.type === "text")?.text ?? "";

  // Strip markdown code fences if present
  const cleaned = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/i, "").trim();

  let parsed: { year: number; ranges: Array<{ startDate: string; endDate: string; halfDay?: string }> };
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    return NextResponse.json(
      { error: "Claude returned non-JSON response", raw },
      { status: 422 }
    );
  }

  if (!parsed.year || !Array.isArray(parsed.ranges)) {
    return NextResponse.json(
      { error: "Unexpected response shape from Claude", raw },
      { status: 422 }
    );
  }

  // Normalize halfDay values
  parsed.ranges = parsed.ranges.map((r) => ({
    ...r,
    halfDay: r.halfDay === "MORNING" ? "MORNING" : r.halfDay === "AFTERNOON" ? "AFTERNOON" : "NONE",
  }));

  return NextResponse.json(parsed);
}
