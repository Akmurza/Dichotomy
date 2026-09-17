import { createSupabaseServerClient } from "@/lib/supabase-server";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const payload = (await request.json().catch(() => null)) as {
    entries?: unknown;
  } | null;

  if (!Array.isArray(payload?.entries) || payload.entries.length === 0) {
    return NextResponse.json(
      { error: "Send a non-empty entries array from the one-time ingestion script." },
      { status: 400 },
    );
  }

  const entries = payload.entries.filter(
    (entry): entry is Record<string, unknown> =>
      typeof entry === "object" && entry !== null &&
      typeof (entry as Record<string, unknown>).source_type === "string" &&
      typeof (entry as Record<string, unknown>).source_title === "string" &&
      typeof (entry as Record<string, unknown>).content === "string" &&
      typeof (entry as Record<string, unknown>).sentence === "string",
  );

  if (entries.length !== payload.entries.length) {
    return NextResponse.json({ error: "Every entry must contain source_type, source_title, content, and sentence." }, { status: 400 });
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.from("rpg_entries").insert(entries).select("id");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ inserted: data.length });
}
