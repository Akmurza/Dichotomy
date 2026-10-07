import { createSupabaseServerClient } from "@/lib/supabase-server";
import { NextResponse } from "next/server";

type SavedPayload = {
  deviceId?: unknown;
  query?: unknown;
  science?: unknown;
  fantasy?: unknown;
};

function validPayload(body: SavedPayload): body is SavedPayload & {
  deviceId: string;
  query: string;
  science: Record<string, unknown>;
  fantasy: Record<string, unknown>;
} {
  return typeof body.deviceId === "string" && body.deviceId.length > 0
    && typeof body.query === "string" && body.query.trim().length > 0
    && typeof body.science === "object" && body.science !== null && !Array.isArray(body.science)
    && typeof body.fantasy === "object" && body.fantasy !== null && !Array.isArray(body.fantasy);
}

function normalizedQuery(query: string) {
  return query.trim().toLocaleLowerCase();
}

export async function GET(request: Request) {
  const deviceId = new URL(request.url).searchParams.get("deviceId");
  if (!deviceId) return NextResponse.json({ error: "Missing deviceId." }, { status: 400 });

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("saved_items")
    .select("id, query, science_result, fantasy_result, created_at")
    .eq("device_id", deviceId)
    .not("science_result", "is", null)
    .not("fantasy_result", "is", null)
    .order("created_at", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ items: data ?? [] });
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as SavedPayload | null;
  if (!body || !validPayload(body)) {
    return NextResponse.json({ error: "Invalid saved pair." }, { status: 400 });
  }

  const supabase = await createSupabaseServerClient();
  const { data: existingRows, error: lookupError } = await supabase
    .from("saved_items")
    .select("id, query, science_result, fantasy_result, created_at")
    .eq("device_id", body.deviceId)
    .not("science_result", "is", null)
    .not("fantasy_result", "is", null)
    .order("created_at", { ascending: false });
  if (lookupError) return NextResponse.json({ error: lookupError.message }, { status: 500 });

  const existing = (existingRows ?? []).find(
    (item) => normalizedQuery(item.query) === normalizedQuery(body.query),
  );
  if (existing) return NextResponse.json({ item: existing });

  const { data, error } = await supabase
    .from("saved_items")
    .insert({
      device_id: body.deviceId,
      query: body.query.trim(),
      science_result: body.science,
      fantasy_result: body.fantasy,
    })
    .select("id, query, science_result, fantasy_result, created_at")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ item: data }, { status: 201 });
}
